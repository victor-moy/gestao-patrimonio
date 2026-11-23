import { CategoriaRelato, Perfil, StatusRelato } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import type { AuthPayload } from '../../middlewares/auth';
import { registrarAuditoria } from '../../services/auditoria.service';
import { codigoChamadoSuporte, criarAvisos, idsAtendentesSuporte } from '../../services/avisos.service';

// Chamado de suporte (tabela relato_problema). Quem abre vê só os próprios chamados; o atendimento
// (Operador com SUPORTE_ATENDER) vê todos, responde e decide o status.

export const LIMITE_TEXTO_MENSAGEM = 2000;

const SELECAO = {
  id: true,
  numero: true,
  perfil: true,
  categoria: true,
  titulo: true,
  tela: true,
  esperado: true,
  aconteceu: true,
  navegador: true,
  anexos: true,
  status: true,
  resolvidoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  usuario: { select: { id: true, nome: true, email: true } },
} as const;

const SELECAO_MENSAGEM = { id: true, texto: true, criadoEm: true, autor: { select: { id: true, nome: true, perfil: true } } } as const;
const SELECAO_LISTA = { ...SELECAO, _count: { select: { mensagens: true } } } as const;

const ehAtendente = (usuario: AuthPayload) => usuario.perfil === Perfil.OPERADOR && usuario.permissoes.includes('SUPORTE_ATENDER');

const href = (id: string) => `/suporte/${id}`;

const ROTULO_STATUS: Record<StatusRelato, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_RETORNO: 'Aguardando retorno',
  RESOLVIDO: 'Resolvido',
};

export async function listarMeus(usuario: AuthPayload) {
  return prisma.relatoProblema.findMany({
    where: { usuarioId: usuario.sub },
    orderBy: { criadoEm: 'desc' },
    take: 200,
    select: SELECAO_LISTA,
  });
}

export async function listarTodos(filtros: { status?: StatusRelato; categoria?: CategoriaRelato }) {
  return prisma.relatoProblema.findMany({
    where: { ...(filtros.status ? { status: filtros.status } : {}), ...(filtros.categoria ? { categoria: filtros.categoria } : {}) },
    orderBy: { criadoEm: 'desc' },
    take: 500,
    select: SELECAO_LISTA,
  });
}

// Quem não é o autor nem do atendimento recebe "não encontrado", para não revelar que o chamado existe
async function carregarComAcesso(usuario: AuthPayload, id: string) {
  const relato = await prisma.relatoProblema.findUnique({ where: { id }, select: SELECAO });
  if (!relato || (relato.usuario.id !== usuario.sub && !ehAtendente(usuario))) {
    throw new AppError('Chamado não encontrado.', 404);
  }
  return relato;
}

export const buscar = carregarComAcesso;

export async function notificarNovoChamado(relato: { id: string; numero: number; titulo: string | null }, autorId: string) {
  const atendentes = (await idsAtendentesSuporte()).filter((uid) => uid !== autorId);
  await criarAvisos(atendentes, {
    tipo: 'CHAMADO_SUPORTE_NOVO',
    titulo: `Novo chamado de suporte ${codigoChamadoSuporte(relato.numero)}`,
    mensagem: relato.titulo ?? 'Chamado sem título',
    href: href(relato.id),
  });
}

export async function listarMensagens(usuario: AuthPayload, id: string, depois?: Date) {
  await carregarComAcesso(usuario, id);
  return prisma.mensagemRelato.findMany({
    where: { relatoId: id, ...(depois ? { criadoEm: { gt: depois } } : {}) },
    orderBy: { criadoEm: 'asc' },
    take: 500,
    select: SELECAO_MENSAGEM,
  });
}

export async function enviarMensagem(usuario: AuthPayload, id: string, texto: string) {
  const relato = await carregarComAcesso(usuario, id);
  if (relato.status === 'RESOLVIDO') {
    throw new AppError('Este chamado está resolvido. O atendimento precisa reabri-lo para receber novas mensagens.', 422);
  }
  const ehAutor = relato.usuario.id === usuario.sub;
  const mensagem = await prisma.$transaction(async (tx) => {
    const criada = await tx.mensagemRelato.create({
      data: { relatoId: id, autorId: usuario.sub, texto },
      select: SELECAO_MENSAGEM,
    });
    // O fluxo anda sozinho: o retorno de quem abriu volta o chamado à análise; a primeira resposta do atendimento tira o "Aberto".
    // A condição de status vai na gravação, para decisões ao mesmo tempo não se atropelarem.
    if (ehAutor) {
      await tx.relatoProblema.updateMany({ where: { id, status: 'AGUARDANDO_RETORNO' }, data: { status: 'EM_ANALISE' } });
    } else {
      await tx.relatoProblema.updateMany({ where: { id, status: 'ABERTO' }, data: { status: 'EM_ANALISE' } });
    }
    // O relato muda de data para subir na lista do atendimento
    await tx.relatoProblema.update({ where: { id }, data: { atualizadoEm: new Date() } });
    return criada;
  });
  // Aviso só dentro do sistema e sem o texto da mensagem
  const codigo = codigoChamadoSuporte(relato.numero);
  if (ehAutor) {
    const participantes = await prisma.mensagemRelato.findMany({ where: { relatoId: id, autorId: { not: usuario.sub } }, select: { autorId: true }, distinct: ['autorId'] });
    const atendentes = new Set(await idsAtendentesSuporte());
    const quemJaRespondeu = participantes.map((p) => p.autorId).filter((uid) => atendentes.has(uid));
    await criarAvisos(quemJaRespondeu.length > 0 ? quemJaRespondeu : [...atendentes].filter((uid) => uid !== usuario.sub), {
      tipo: 'CHAMADO_SUPORTE_MENSAGEM',
      titulo: `Nova mensagem no chamado ${codigo}`,
      mensagem: `${usuario.nome} respondeu ao chamado.`,
      href: href(id),
    });
  } else {
    await criarAvisos([relato.usuario.id], {
      tipo: 'CHAMADO_SUPORTE_MENSAGEM',
      titulo: `Resposta no chamado ${codigo}`,
      mensagem: 'O atendimento respondeu ao seu chamado de suporte.',
      href: href(id),
    });
  }
  return mensagem;
}

// Só o atendimento muda o status. Reabrir é voltar um chamado resolvido a qualquer outro status.
export async function alterarStatus(usuario: AuthPayload, id: string, status: StatusRelato) {
  const resultado = await prisma.$transaction(async (tx) => {
    const anterior = await tx.relatoProblema.findUnique({ where: { id }, select: { status: true, numero: true, usuarioId: true } });
    if (!anterior) throw new AppError('Chamado não encontrado.', 404);
    if (anterior.status === status) throw new AppError('O chamado já está neste status.', 422);
    // Condição de status na gravação: duas decisões ao mesmo tempo não se atropelam
    const mudou = await tx.relatoProblema.updateMany({
      where: { id, status: anterior.status },
      data: { status, resolvidoEm: status === 'RESOLVIDO' ? new Date() : null },
    });
    if (mudou.count === 0) throw new AppError('O chamado mudou de situação. Atualize a página.', 409);
    const reabriu = anterior.status === 'RESOLVIDO';
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: reabriu ? 'REABRIR_RELATO' : 'ALTERAR_STATUS_RELATO',
        entidade: 'relato_problema',
        entidadeId: id,
        dadosAntes: { status: anterior.status },
        dadosDepois: { status },
      },
      tx,
    );
    return { numero: anterior.numero, autorId: anterior.usuarioId, reabriu, novo: await tx.relatoProblema.findUniqueOrThrow({ where: { id }, select: SELECAO }) };
  });
  if (resultado.autorId !== usuario.sub) {
    await criarAvisos([resultado.autorId], {
      tipo: 'CHAMADO_SUPORTE_STATUS',
      titulo: `Chamado ${codigoChamadoSuporte(resultado.numero)}: ${ROTULO_STATUS[status].toLowerCase()}`,
      mensagem: resultado.reabriu ? 'O atendimento reabriu o seu chamado de suporte.' : `O status do seu chamado agora é "${ROTULO_STATUS[status]}".`,
      href: href(id),
    });
  }
  return resultado.novo;
}
