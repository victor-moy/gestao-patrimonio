import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

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
  await tx.logAuditoria.create({
    data: {
      usuarioId: params.usuarioId ?? null,
      acao: params.acao,
      entidade: params.entidade,
      entidadeId: params.entidadeId ?? null,
      dadosAntes: params.dadosAntes as Prisma.InputJsonValue ?? Prisma.JsonNull,
      dadosDepois: params.dadosDepois as Prisma.InputJsonValue ?? Prisma.JsonNull,
    },
  });
}
