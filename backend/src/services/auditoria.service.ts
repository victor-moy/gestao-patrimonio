import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { contextoPedido } from '../middlewares/auth';

type Tx = Prisma.TransactionClient;

function comAtor(dadosDepois: unknown, impersonadoPor: { id: string; nome: string; perfil: string } | null | undefined) {
  if (!impersonadoPor) return dadosDepois;
  const base =
    dadosDepois && typeof dadosDepois === 'object' && !Array.isArray(dadosDepois)
      ? (dadosDepois as Record<string, unknown>)
      : dadosDepois === undefined
        ? {}
        : { valor: dadosDepois };
  if ('impersonadoPor' in base && base.impersonadoPor && typeof base.impersonadoPor === 'object') {
    return base;
  }
  return { ...base, impersonadoPor };
}

// RNF06 — registra ações críticas bem-sucedidas com snapshot
// antes/depois. FA07: tentativas inválidas não são auditadas
// (a exceção interrompe o fluxo antes deste registro).
export async function registrarAuditoria(
  params: {
    usuarioId?: string | null;
    acao: string;
    entidade: string;
    entidadeId?: string | null;
    dadosAntes?: unknown;
    dadosDepois?: unknown;
  },
  tx: Tx | typeof prisma = prisma,
) {
  const ator = contextoPedido.getStore()?.impersonadoPor;
  await tx.logAuditoria.create({
    data: {
      usuarioId: params.usuarioId ?? null,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId ?? null,
      dadosAntes: params.dadosAntes as Prisma.InputJsonValue ?? Prisma.JsonNull,
      dadosDepois: (comAtor(params.dadosDepois, ator) as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    },
  });
}
