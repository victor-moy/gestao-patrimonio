// Consulta de solicitações: lista, detalhe e histórico.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { numeroDaBusca } from '../../lib/numero';
import { AppError } from '../../errors/AppError';
import { AuthPayload } from '../../middlewares/auth';
import { anotarDisponibilidade, includePadrao } from './solicitacoes.comum';

export async function listar(usuario: AuthPayload, filtros: { tipo?: string; status?: string; busca?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE'
      ? {
          OR: [
            { unidadeOrigemId: usuario.unidadeId ?? '' },
            { unidadeDestinoId: usuario.unidadeId ?? '' },
          ],
        }
      : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
    ...(filtros.status ? { status: filtros.status as never } : {}),
    ...(filtros.busca
      ? {
          OR: [
            ...(numeroDaBusca(filtros.busca, 'SOL') !== null ? [{ numero: numeroDaBusca(filtros.busca, 'SOL') as number }] : []),
            { justificativa: { contains: filtros.busca, mode: 'insensitive' as const } },
            { equipamento: { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { tipoEquipamento: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidadeOrigem: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
  // Solicitações aguardando estoque: prioridade (1 = mais urgente, definida
  // pelo Gestor na aprovação) + antiguidade juntas, conforme feedback do
  // cliente 17/08 — nos demais filtros mantém mais recente primeiro.
  const orderBy: Prisma.SolicitacaoOrderByWithRelationInput[] =
    filtros.status === 'AGUARDANDO_DISPONIBILIDADE'
      ? [{ prioridade: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'asc' }]
      : [{ criadoEm: 'desc' }];
  const solicitacoes = await prisma.solicitacao.findMany({
    where,
    include: includePadrao,
    orderBy,
  });
  return anotarDisponibilidade(solicitacoes);
}

export async function buscarPorId(usuario: AuthPayload, id: string) {
  const solicitacao = await prisma.solicitacao.findUnique({
    where: { id },
    include: includePadrao,
  });
  if (!solicitacao) throw new AppError('Solicitação não encontrada.', 404);
  if (
    usuario.perfil === 'UNIDADE' &&
    solicitacao.unidadeOrigemId !== usuario.unidadeId &&
    solicitacao.unidadeDestinoId !== usuario.unidadeId
  ) {
    throw new AppError('Esta solicitação não envolve a sua unidade.', 403);
  }
  const [anotada] = await anotarDisponibilidade([solicitacao]);
  return anotada;
}

// Linha do tempo da solicitação: abertura + ações auditadas. Expõe só o que a
// tela precisa (ação, autor, data e o resultado do recebimento), nunca o
// payload bruto da auditoria.
export async function historico(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  const logs = await prisma.logAuditoria.findMany({
    where: { entidade: 'solicitacao', entidadeId: id },
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      acao: true,
      criadoEm: true,
      dadosDepois: true,
      usuario: { select: { nome: true } },
    },
  });
  return [
    {
      id: 'abertura',
      acao: 'ABRIR_SOLICITACAO',
      criadoEm: solicitacao.criadoEm,
      usuario: solicitacao.criadoPor?.nome ?? null,
    },
    ...logs.map((log) => {
      const dados = (log.dadosDepois ?? {}) as { recebimentoOk?: unknown };
      return {
        id: log.id,
        acao: log.acao,
        criadoEm: log.criadoEm,
        usuario: log.usuario?.nome ?? null,
        ...(typeof dados.recebimentoOk === 'boolean' ? { recebimentoOk: dados.recebimentoOk } : {}),
      };
    }),
  ];
}
