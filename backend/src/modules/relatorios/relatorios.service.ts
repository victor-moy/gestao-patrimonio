import { Prisma, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface FiltrosPeriodo {
  dataInicio?: Date;
  dataFim?: Date;
}

function filtroPeriodo(filtros: FiltrosPeriodo): Prisma.SolicitacaoWhereInput {
  if (!filtros.dataInicio && !filtros.dataFim) return {};
  return {
    criadoEm: {
      ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
      ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
    },
  };
}

async function mapaNomeUnidade() {
  const unidades = await prisma.unidade.findMany({ select: { id: true, nome: true } });
  return (id: string) => unidades.find((u) => u.id === id)?.nome ?? 'Desconhecida';
}

// Status terminais que não representam sucesso — o resto (PENDENTE_APROVACAO,
// RESERVADO, AGUARDANDO_*, etc.) conta como "em andamento" pro funil.
const TERMINAL_NEGADA = new Set(['NEGADA', 'CANCELADA', 'EXPIRADA']);

const TODOS_TIPOS: TipoSolicitacao[] = ['SUBSTITUICAO', 'AMPLIACAO', 'CESSAO_USO', 'EMPRESTIMO', 'RECOLHA'];

// Relatório 1 — Visão Geral de Solicitações: funil por tipo (em andamento /
// concluída / negada-cancelada), já que os 13 status brutos ficariam
// ilegíveis num gráfico.
export async function visaoGeral(filtros: FiltrosPeriodo & { unidadeId?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    ...(filtros.unidadeId ? { unidadeOrigemId: filtros.unidadeId } : {}),
    ...filtroPeriodo(filtros),
  };
  const grupos = await prisma.solicitacao.groupBy({
    by: ['tipo', 'status'],
    where,
    _count: { id: true },
  });
  const porTipo = new Map<TipoSolicitacao, { emAndamento: number; concluida: number; negadaCancelada: number }>();
  for (const tipo of TODOS_TIPOS) {
    porTipo.set(tipo, { emAndamento: 0, concluida: 0, negadaCancelada: 0 });
  }
  for (const g of grupos) {
    const bucket = porTipo.get(g.tipo)!;
    if (g.status === 'CONCLUIDA') bucket.concluida += g._count.id;
    else if (TERMINAL_NEGADA.has(g.status)) bucket.negadaCancelada += g._count.id;
    else bucket.emAndamento += g._count.id;
  }
  return TODOS_TIPOS.map((tipo) => ({ tipo, ...porTipo.get(tipo)! }));
}

// Relatório 2 — Ranking de Unidades por Tipo. Cessão de Uso fica de fora do
// seletor no frontend: unidadeOrigemId ali é o galpão que tinha o estoque,
// não uma unidade solicitando, então rankear não responde a mesma pergunta.
export async function rankingUnidades(filtros: FiltrosPeriodo & { tipo: TipoSolicitacao }) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: filtros.tipo,
    ...filtroPeriodo(filtros),
  };
  const grupos = await prisma.solicitacao.groupBy({
    by: ['unidadeOrigemId'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  const nomeUnidade = await mapaNomeUnidade();
  return grupos.map((g) => ({
    unidadeId: g.unidadeOrigemId,
    unidade: nomeUnidade(g.unidadeOrigemId),
    quantidade: g._count.id,
  }));
}

// Relatório 3 — Empréstimos: prazos e devoluções. "Atrasado" cobre tanto o
// empréstimo ainda em aberto além do prazo quanto o que já foi devolvido
// depois do prazo (mesma regra do alerta EMPRESTIMO_ATRASADO do dashboard,
// aqui virando dado consultável em vez de só uma mensagem).
export async function emprestimos(filtros: FiltrosPeriodo & { unidadeId?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: 'EMPRESTIMO',
    ...(filtros.unidadeId ? { unidadeOrigemId: filtros.unidadeId } : {}),
    ...filtroPeriodo(filtros),
  };
  const registros = await prisma.solicitacao.findMany({
    where,
    include: {
      equipamento: { select: { tombamento: true, descricao: true } },
      unidadeOrigem: { select: { nome: true } },
      unidadeDestino: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });

  const agora = new Date();
  const itens = registros.map((s) => {
    const atrasado =
      (s.status === 'AGUARDANDO_RETORNO' &&
        s.dataRetornoPrevista !== null &&
        s.dataRetornoPrevista < agora) ||
      (s.status === 'CONCLUIDA' &&
        s.dataRetornoPrevista !== null &&
        s.atualizadoEm > s.dataRetornoPrevista);
    return {
      id: s.id,
      equipamento: s.equipamento ? `${s.equipamento.tombamento} — ${s.equipamento.descricao}` : null,
      unidadeOrigem: s.unidadeOrigem.nome,
      unidadeDestino: s.unidadeDestino?.nome ?? null,
      dataRetornoPrevista: s.dataRetornoPrevista,
      status: s.status,
      atrasado,
      criadoEm: s.criadoEm,
    };
  });

  // % de atraso só faz sentido sobre empréstimos que já saíram (aguardando
  // retorno ou concluídos) — os que ainda estão pendentes de aprovação/saída
  // não têm como estar atrasados ainda.
  const relevantes = itens.filter((i) => i.status === 'AGUARDANDO_RETORNO' || i.status === 'CONCLUIDA');
  const percentualAtraso =
    relevantes.length > 0
      ? Math.round((relevantes.filter((i) => i.atrasado).length / relevantes.length) * 100)
      : 0;

  // Duração aproximada do processo completo (abertura → devolução
  // confirmada) — não temos timestamp isolado de "quando saiu"/"quando
  // voltou" na Solicitacao, só criadoEm/atualizadoEm.
  const concluidos = registros.filter((s) => s.status === 'CONCLUIDA');
  const duracoesDias = concluidos.map(
    (s) => (s.atualizadoEm.getTime() - s.criadoEm.getTime()) / (24 * 60 * 60 * 1000),
  );
  const duracaoMediaDias =
    duracoesDias.length > 0
      ? Math.round(duracoesDias.reduce((a, b) => a + b, 0) / duracoesDias.length)
      : 0;

  return { percentualAtraso, duracaoMediaDias, itens };
}

// Relatório 4 — Cessões de Uso: prestação de contas (o que foi cedido, pra
// quem, com qual nº de patrimônio).
export async function cessoes(filtros: FiltrosPeriodo) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: 'CESSAO_USO',
    ...filtroPeriodo(filtros),
  };
  const registros = await prisma.solicitacao.findMany({
    where,
    include: {
      tipoEquipamento: { select: { nome: true } },
      unidadeOrigem: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });
  return {
    itens: registros.map((s) => ({
      id: s.id,
      entidadeExternaNome: s.entidadeExternaNome,
      tipoEquipamento: s.tipoEquipamento?.nome ?? null,
      numerosPatrimonio: s.numerosPatrimonio,
      unidadeOrigem: s.unidadeOrigem.nome,
      status: s.status,
      numeroPedidoBranet: s.numeroPedidoBranet,
      dataConclusao: s.pedidoEntregaRegistradoEm,
      criadoEm: s.criadoEm,
    })),
  };
}
