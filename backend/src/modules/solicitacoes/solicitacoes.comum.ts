// Peças compartilhadas entre os fluxos de solicitação (consulta, criação, decisão e execução).

import { Prisma, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';

export const includePadrao = {
  unidadeOrigem: { select: { id: true, nome: true, emailBase: true } },
  unidadeDestino: { select: { id: true, nome: true, emailBase: true, tipo: true } },
  equipamento: {
    select: {
      id: true,
      tombamento: true,
      descricao: true,
      status: true,
      emendaParlamentar: true,
      tipoEquipamentoId: true,
      tipoEquipamento: { select: { nome: true } },
    },
  },
  tipoEquipamento: { select: { id: true, nome: true, codigo: true } },
  ata: { select: { id: true, numero: true, saldo: true, vencimento: true } },
  criadoPor: { select: { nome: true } },
  decididoPor: { select: { nome: true } },
  // Itens (Equipamento) criados por esta solicitação ao marcar "lançado no
  // Branet" — usados na confirmação de recebimento (comparar tombamento) e
  // no eventual ajuste antes de concluir (feedback do cliente 17/08).
  itensGerados: { select: { id: true, tombamento: true, descricao: true } },
} satisfies Prisma.SolicitacaoInclude;

// Tipos que seguem o fluxo de aquisição via ata (RF29): pedem um item novo
// ao galpão, com ou sem baixa associada de um equipamento existente.
export const TIPOS_COM_ATA: TipoSolicitacao[] = ['AMPLIACAO', 'SUBSTITUICAO'];

// Tenta reservar do estoque de galpão já existente (mesma tabela por trás da
// tela de Estoque) — pega o galpão com mais quantidade que sozinho atenda a
// solicitação e decrementa. Não faz reserva parcial entre galpões.
export async function tentarReservarDoEstoque(
  tx: Prisma.TransactionClient,
  tipoEquipamentoId: string,
  quantidade: number,
) {
  const pools = await tx.estoqueGalpao.findMany({
    where: { tipoEquipamentoId },
    orderBy: { quantidade: 'desc' },
  });
  // O decremento é condicional (quantidade >= pedido) para que duas reservas
  // simultâneas nunca deixem o estoque negativo: se outra transação consumiu o
  // saldo entre a leitura e a escrita, o count volta 0 e tentamos o próximo galpão.
  for (const pool of pools.filter((p) => p.quantidade >= quantidade)) {
    const { count } = await tx.estoqueGalpao.updateMany({
      where: { id: pool.id, quantidade: { gte: quantidade } },
      data: { quantidade: { decrement: quantidade } },
    });
    if (count === 1) return pool;
  }
  return null;
}

// Indica no card se já há estoque suficiente pra reservar uma solicitação em
// AGUARDANDO_DISPONIBILIDADE, sem reservar de fato — só pra sinalizar pro
// Gestor de Patrimônio que vale clicar em "Tentar Reservar do Estoque".
export async function anotarDisponibilidade<
  T extends { status: string; tipoEquipamentoId: string | null; quantidade: number | null },
>(solicitacoes: T[]): Promise<(T & { disponivelParaReserva: boolean })[]> {
  const pendentes = solicitacoes.filter(
    (s) => s.status === 'AGUARDANDO_DISPONIBILIDADE' && s.tipoEquipamentoId,
  );
  const maiorPorTipo = new Map<string, number>();
  if (pendentes.length > 0) {
    const pools = await prisma.estoqueGalpao.findMany({
      where: { tipoEquipamentoId: { in: [...new Set(pendentes.map((s) => s.tipoEquipamentoId!))] } },
    });
    for (const pool of pools) {
      maiorPorTipo.set(
        pool.tipoEquipamentoId,
        Math.max(maiorPorTipo.get(pool.tipoEquipamentoId) ?? 0, pool.quantidade),
      );
    }
  }
  return solicitacoes.map((s) => ({
    ...s,
    disponivelParaReserva:
      s.status === 'AGUARDANDO_DISPONIBILIDADE' &&
      !!s.tipoEquipamentoId &&
      (maiorPorTipo.get(s.tipoEquipamentoId) ?? 0) >= (s.quantidade ?? 0),
  }));
}

// Recolha não pede mais pro Gestor escolher o galpão — vai sempre pro único
// galpão padrão do fluxo Branet (feedback do cliente 27/08: o que importa
// pro Gestor é a etapa administrativa — Patrimônio ou Branet —, não pra qual
// dos galpões operacionais o item vai fisicamente).
export async function buscarGalpaoPadraoRecolha() {
  const galpao = await prisma.unidade.findFirst({
    where: { nome: 'Galpão CIAD/Branet', tipo: 'GALPAO' },
  });
  if (!galpao) {
    throw new AppError('Galpão padrão de recolha (Galpão CIAD/Branet) não está cadastrado.', 500);
  }
  return galpao;
}
