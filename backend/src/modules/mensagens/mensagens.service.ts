import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { notificar } from '../../services/notificacao.service';
import type { AuthPayload } from '../../middlewares/auth';

export type ContextoChat = 'solicitacao' | 'manutencao';

export const LIMITE_TEXTO = 2000;
const LIMITE_LISTAGEM = 500;

// Quem participa da conversa: os mesmos perfis que enxergam a solicitação/manutenção
// na interface, respeitando a unidade quando o usuário é de Unidade.
const PERFIS: Record<ContextoChat, Perfil[]> = {
  solicitacao: [Perfil.GESTOR_PATRIMONIO, Perfil.UNIDADE, Perfil.GALPAO],
  manutencao: [Perfil.GESTOR_PATRIMONIO, Perfil.GESTOR_MANUTENCAO, Perfil.UNIDADE],
};

interface Acesso {
  emailUnidade: string | null;
  titulo: string;
}

async function verificarAcesso(usuario: AuthPayload, contexto: ContextoChat, id: string): Promise<Acesso> {
  if (!PERFIS[contexto].includes(usuario.perfil)) {
    throw new AppError('Seu perfil não participa desta conversa.', 403);
  }
  if (contexto === 'solicitacao') {
    const s = await prisma.solicitacao.findUnique({
      where: { id },
      select: { unidadeOrigemId: true, unidadeDestinoId: true, unidadeOrigem: { select: { emailBase: true } } },
    });
    if (!s) throw new AppError('Solicitação não encontrada.', 404);
    if (usuario.perfil === Perfil.UNIDADE && s.unidadeOrigemId !== usuario.unidadeId && s.unidadeDestinoId !== usuario.unidadeId) {
      throw new AppError('Esta solicitação não envolve a sua unidade.', 403);
    }
    return { emailUnidade: s.unidadeOrigem?.emailBase ?? null, titulo: 'solicitação' };
  }
  const m = await prisma.manutencao.findUnique({
    where: { id },
    select: { unidadeId: true, unidade: { select: { emailBase: true } } },
  });
  if (!m) throw new AppError('Manutenção não encontrada.', 404);
  if (usuario.perfil === Perfil.UNIDADE && m.unidadeId !== usuario.unidadeId) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  return { emailUnidade: m.unidade?.emailBase ?? null, titulo: 'manutenção' };
}

const selecaoMensagem = {
  id: true,
  texto: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true, perfil: true } },
} as const;

const chave = (contexto: ContextoChat, id: string) =>
  contexto === 'solicitacao' ? { solicitacaoId: id } : { manutencaoId: id };

// `depois` permite à tela buscar só o que chegou desde a última mensagem recebida.
export async function listar(usuario: AuthPayload, contexto: ContextoChat, id: string, depois?: Date) {
  await verificarAcesso(usuario, contexto, id);
  return prisma.mensagemChat.findMany({
    where: { ...chave(contexto, id), ...(depois ? { criadoEm: { gt: depois } } : {}) },
    select: selecaoMensagem,
    orderBy: { criadoEm: 'asc' },
    take: LIMITE_LISTAGEM,
  });
}

export async function enviar(usuario: AuthPayload, contexto: ContextoChat, id: string, texto: string) {
  const acesso = await verificarAcesso(usuario, contexto, id);
  const mensagem = await prisma.mensagemChat.create({
    data: { ...chave(contexto, id), autorId: usuario.sub, texto },
    select: selecaoMensagem,
  });
  // Só o aviso (sem o conteúdo) vai por e-mail, e apenas quando quem escreveu não é a própria unidade
  if (usuario.perfil !== Perfil.UNIDADE) {
    await notificar(
      acesso.emailUnidade,
      `Nova mensagem na ${acesso.titulo}`,
      `Há uma nova mensagem de ${usuario.nome} na ${acesso.titulo}. Acesse o sistema para ler e responder.`,
    );
  }
  return mensagem;
}

export interface ConversaResumo {
  contexto: ContextoChat;
  id: string;
  numero: number;
  tipoSolicitacao: string | null;
  item: string | null;
  unidade: string | null;
  ultimaEm: Date;
  ultimoTexto: string;
  ultimoAutor: string;
}

const LIMITE_CONVERSAS = 50;

// Conversas com ao menos uma mensagem que o usuário pode ver, da mais recente para a mais antiga.
export async function listarConversas(usuario: AuthPayload): Promise<ConversaResumo[]> {
  const ehUnidade = usuario.perfil === Perfil.UNIDADE;
  const ultimas = {
    mensagens: { orderBy: { criadoEm: 'desc' as const }, take: 1, select: { texto: true, criadoEm: true, autor: { select: { nome: true } } } },
  };

  const [solicitacoes, manutencoes] = await Promise.all([
    PERFIS.solicitacao.includes(usuario.perfil)
      ? prisma.solicitacao.findMany({
          where: {
            mensagens: { some: {} },
            ...(ehUnidade ? { OR: [{ unidadeOrigemId: usuario.unidadeId ?? '' }, { unidadeDestinoId: usuario.unidadeId ?? '' }] } : {}),
          },
          select: {
            id: true,
            numero: true,
            tipo: true,
            unidadeOrigem: { select: { nome: true } },
            equipamento: { select: { descricao: true } },
            tipoEquipamento: { select: { nome: true } },
            ...ultimas,
          },
          take: 200,
        })
      : [],
    PERFIS.manutencao.includes(usuario.perfil)
      ? prisma.manutencao.findMany({
          where: { mensagens: { some: {} }, ...(ehUnidade ? { unidadeId: usuario.unidadeId ?? '' } : {}) },
          select: {
            id: true,
            numero: true,
            unidade: { select: { nome: true } },
            equipamento: { select: { descricao: true } },
            ...ultimas,
          },
          take: 200,
        })
      : [],
  ]);

  const resumo = (m: { texto: string; criadoEm: Date; autor: { nome: string } } | undefined) => ({
    ultimaEm: m?.criadoEm ?? new Date(0),
    ultimoTexto: m?.texto ?? '',
    ultimoAutor: m?.autor.nome ?? '',
  });

  return [
    ...solicitacoes.map((s) => ({
      contexto: 'solicitacao' as const,
      id: s.id,
      numero: s.numero,
      tipoSolicitacao: s.tipo as string,
      item: s.tipoEquipamento?.nome ?? s.equipamento?.descricao ?? null,
      unidade: s.unidadeOrigem?.nome ?? null,
      ...resumo(s.mensagens[0]),
    })),
    ...manutencoes.map((m) => ({
      contexto: 'manutencao' as const,
      id: m.id,
      numero: m.numero,
      tipoSolicitacao: null,
      item: m.equipamento?.descricao ?? null,
      unidade: m.unidade?.nome ?? null,
      ...resumo(m.mensagens[0]),
    })),
  ]
    .sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime())
    .slice(0, LIMITE_CONVERSAS);
}
