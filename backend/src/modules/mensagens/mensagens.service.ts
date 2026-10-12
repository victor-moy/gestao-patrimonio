import { randomUUID } from 'crypto';
import { Perfil, Prisma, StatusManutencao, StatusSolicitacao } from '@prisma/client';
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
  solicitacao: [Perfil.OPERADOR, Perfil.UNIDADE, Perfil.GALPAO],
  manutencao: [Perfil.OPERADOR, Perfil.UNIDADE, Perfil.TERCEIRIZADA],
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
    select: { unidadeId: true, unidade: { select: { emailBase: true } }, contrato: { select: { prestadorId: true } } },
  });
  if (!m) throw new AppError('Manutenção não encontrada.', 404);
  if (
    usuario.perfil === Perfil.TERCEIRIZADA &&
    (!usuario.prestadorId || m.contrato?.prestadorId !== usuario.prestadorId)
  ) {
    throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
  }
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
  titulo: string | null;
  tipoSolicitacao: string | null;
  item: string | null;
  unidade: string | null;
  ultimaEm: Date;
  ultimoTexto: string;
  ultimoAutor: string;
  // Mensagens de outras pessoas que o usuário ainda não leu nesta conversa
  naoLidas: number;
}

const LIMITE_CONVERSAS = 50;

// Quais conversas o usuário enxerga na lista e conta como "não lidas". O acesso direto a uma conversa
// (pelo botão Conversar do pedido) segue a regra de `verificarAcesso`; aqui é só a listagem.
//  - Unidade: as da própria unidade.
//  - Galpão: as solicitações que enxerga.
//  - Administradores: só as em que estão envolvidos — escreveram nela, criaram o
//    pedido ou decidiram o pedido. Enquanto um pedido está pendente e sem decisão, ele é uma fila: todos
//    os administradores o enxergam.
function filtrosDeVisibilidade(usuario: AuthPayload) {
  const uid = usuario.sub;
  const unidadeId = usuario.unidadeId ?? '';
  const ehUnidade = usuario.perfil === Perfil.UNIDADE;
  const ehGestor = usuario.perfil === Perfil.OPERADOR;

  const solicitacao: Prisma.SolicitacaoWhereInput | null = PERFIS.solicitacao.includes(usuario.perfil)
    ? {
        mensagens: { some: {} },
        ...(ehUnidade ? { OR: [{ unidadeOrigemId: unidadeId }, { unidadeDestinoId: unidadeId }] } : {}),
        ...(ehGestor
          ? {
              OR: [
                { mensagens: { some: { autorId: uid } } },
                { criadoPorId: uid },
                { decididoPorId: uid },
                ...(usuario.perfil === Perfil.OPERADOR
                  ? [{ status: StatusSolicitacao.PENDENTE_APROVACAO, decididoPorId: null }]
                  : []),
              ],
            }
          : {}),
      }
    : null;

  const manutencao: Prisma.ManutencaoWhereInput | null = PERFIS.manutencao.includes(usuario.perfil)
    ? {
        mensagens: { some: {} },
        ...(ehUnidade ? { unidadeId } : {}),
        ...(usuario.perfil === Perfil.TERCEIRIZADA ? { contrato: { prestadorId: usuario.prestadorId ?? '' } } : {}),
        ...(ehGestor
          ? {
              OR: [
                { mensagens: { some: { autorId: uid } } },
                { solicitanteId: uid },
                { decididoPorId: uid },
                ...(usuario.perfil === Perfil.OPERADOR
                  ? [{ status: StatusManutencao.PENDENTE_APROVACAO, decididoPorId: null }]
                  : []),
              ],
            }
          : {}),
      }
    : null;

  return { solicitacao, manutencao };
}

// Mensagens de outras pessoas mais novas que a última leitura do usuário (ou todas, se nunca leu), por conversa.
async function naoLidasPorConversa(uid: string, solicitacaoIds: string[], manutencaoIds: string[]) {
  const mapa = new Map<string, number>();
  const contar = async (contexto: ContextoChat, ids: string[]) => {
    if (ids.length === 0) return;
    const coluna = Prisma.raw(contexto === 'solicitacao' ? '"solicitacao_id"' : '"manutencao_id"');
    const linhas = await prisma.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
      SELECT m.${coluna} AS id, COUNT(*)::int AS n
      FROM "mensagem_chat" m
      LEFT JOIN "conversa_leitura" l ON l."usuario_id" = ${uid} AND l.${coluna} = m.${coluna}
      WHERE m.${coluna} IN (${Prisma.join(ids)})
        AND m."autor_id" <> ${uid}
        AND (l."lida_ate" IS NULL OR m."criado_em" > l."lida_ate")
      GROUP BY m.${coluna}
    `);
    for (const { id, n } of linhas ?? []) mapa.set(`${contexto}:${id}`, n);
  };
  await Promise.all([contar('solicitacao', solicitacaoIds), contar('manutencao', manutencaoIds)]);
  return mapa;
}

// Conversas com ao menos uma mensagem que o usuário pode ver, da mais recente para a mais antiga.
export async function listarConversas(usuario: AuthPayload): Promise<ConversaResumo[]> {
  const ultimas = {
    mensagens: { orderBy: { criadoEm: 'desc' as const }, take: 1, select: { texto: true, criadoEm: true, autor: { select: { nome: true } } } },
  };
  const filtros = filtrosDeVisibilidade(usuario);

  const [solicitacoes, manutencoes] = await Promise.all([
    filtros.solicitacao
      ? prisma.solicitacao.findMany({
          where: filtros.solicitacao,
          select: {
            id: true,
            numero: true,
            titulo: true,
            tipo: true,
            unidadeOrigem: { select: { nome: true } },
            equipamento: { select: { descricao: true } },
            tipoEquipamento: { select: { nome: true } },
            ...ultimas,
          },
          take: 200,
        })
      : [],
    filtros.manutencao
      ? prisma.manutencao.findMany({
          where: filtros.manutencao,
          select: {
            id: true,
            numero: true,
            titulo: true,
            unidade: { select: { nome: true } },
            equipamento: { select: { descricao: true } },
            ...ultimas,
          },
          take: 200,
        })
      : [],
  ]);

  const naoLidas = await naoLidasPorConversa(
    usuario.sub,
    solicitacoes.map((s) => s.id),
    manutencoes.map((m) => m.id),
  );

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
      titulo: s.titulo,
      tipoSolicitacao: s.tipo as string,
      item: s.tipoEquipamento?.nome ?? s.equipamento?.descricao ?? null,
      unidade: s.unidadeOrigem?.nome ?? null,
      ...resumo(s.mensagens[0]),
      naoLidas: naoLidas.get(`solicitacao:${s.id}`) ?? 0,
    })),
    ...manutencoes.map((m) => ({
      contexto: 'manutencao' as const,
      id: m.id,
      numero: m.numero,
      titulo: m.titulo,
      tipoSolicitacao: null,
      item: m.equipamento?.descricao ?? null,
      unidade: m.unidade?.nome ?? null,
      ...resumo(m.mensagens[0]),
      naoLidas: naoLidas.get(`manutencao:${m.id}`) ?? 0,
    })),
  ]
    .sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime())
    .slice(0, LIMITE_CONVERSAS);
}

// Total de mensagens não lidas e de conversas com não lidas (alimenta os indicadores da interface).
export async function contarNaoLidas(usuario: AuthPayload) {
  const filtros = filtrosDeVisibilidade(usuario);
  const [solicitacoes, manutencoes] = await Promise.all([
    filtros.solicitacao ? prisma.solicitacao.findMany({ where: filtros.solicitacao, select: { id: true }, take: 500 }) : [],
    filtros.manutencao ? prisma.manutencao.findMany({ where: filtros.manutencao, select: { id: true }, take: 500 }) : [],
  ]);
  const mapa = await naoLidasPorConversa(
    usuario.sub,
    solicitacoes.map((s) => s.id),
    manutencoes.map((m) => m.id),
  );
  let total = 0;
  for (const n of mapa.values()) total += n;
  return { total, conversas: mapa.size };
}

// Marca a conversa como lida até `ate` (a data da última mensagem que a pessoa viu). Só avança: uma
// leitura mais antiga nunca desfaz uma mais nova, e o upsert é atômico mesmo com abas concorrentes.
export async function marcarLida(usuario: AuthPayload, contexto: ContextoChat, id: string, ate: Date) {
  await verificarAcesso(usuario, contexto, id);
  const agora = new Date();
  const lidaAte = ate.getTime() > agora.getTime() ? agora : ate;
  const coluna = Prisma.raw(contexto === 'solicitacao' ? '"solicitacao_id"' : '"manutencao_id"');
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "conversa_leitura" ("id", "usuario_id", ${coluna}, "lida_ate")
    VALUES (${randomUUID()}, ${usuario.sub}, ${id}, ${lidaAte})
    ON CONFLICT ("usuario_id", ${coluna})
    DO UPDATE SET "lida_ate" = GREATEST("conversa_leitura"."lida_ate", EXCLUDED."lida_ate")
  `);
}
