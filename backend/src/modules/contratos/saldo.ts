import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type Cliente = Prisma.TransactionClient | typeof prisma;

// Valor já comprometido de cada item de contrato: custo final (ou, na falta dele, o orçamento) das manutenções
// vinculadas. Negadas e baixadas não consomem saldo, nem o atendimento encerrado por reencaminhamento sem custo final (o serviço não foi feito). `excluirManutencaoId` tira da conta a manutenção em análise.
export async function comprometidoPorItem(cliente: Cliente, itemIds: string[], excluirManutencaoId?: string) {
  const mapa = new Map<string, number>();
  if (itemIds.length === 0) return mapa;
  const linhas = await cliente.$queryRaw<Array<{ item: string; total: Prisma.Decimal | number | string | null }>>`
    SELECT contrato_item_id AS item, SUM(COALESCE(NULLIF(custo_final, 0), orcamento_valor, 0)) AS total
    FROM manutencao
    WHERE contrato_item_id IN (${Prisma.join(itemIds)})
      AND status NOT IN ('NEGADA', 'BAIXADO')
      AND NOT (status = 'CONCLUIDA' AND reencaminhamento_confirmado_em IS NOT NULL AND COALESCE(custo_final, 0) = 0)
      AND (${excluirManutencaoId ?? null}::text IS NULL OR id <> ${excluirManutencaoId ?? null}::text)
    GROUP BY contrato_item_id`;
  for (const linha of linhas ?? []) mapa.set(linha.item, Number(linha.total ?? 0));
  return mapa;
}

// Arredonda em centavos para o saldo não acumular erro de ponto flutuante
export function saldoDoItem(valor: Prisma.Decimal | number | string, comprometido: number) {
  return Math.round((Number(valor) - comprometido) * 100) / 100;
}
