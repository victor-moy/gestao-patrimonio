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

// Um "item" (tipo de equipamento) é referenciado de duas formas na
// Solicitacao: direto (Ampliação/Substituição/Cessão de Uso, que pedem um
// tipo, não uma unidade física ainda existente) ou via o equipamento
// específico (Empréstimo/Recolha, que apontam pra um item já cadastrado).
// O filtro cobre os dois casos.
function filtroItem(tipoEquipamentoId?: string): Prisma.SolicitacaoWhereInput {
  if (!tipoEquipamentoId) return {};
  return { OR: [{ tipoEquipamentoId }, { equipamento: { tipoEquipamentoId } }] };
}

// Status terminais que não representam sucesso — o resto (PENDENTE_APROVACAO,
// RESERVADO, AGUARDANDO_*, etc.) conta como "em andamento" pro funil.
const TERMINAL_NEGADA = new Set(['NEGADA', 'CANCELADA', 'EXPIRADA']);

const TODOS_TIPOS: TipoSolicitacao[] = ['SUBSTITUICAO', 'AMPLIACAO', 'CESSAO_USO', 'EMPRESTIMO', 'RECOLHA'];

// Cessão de Uso fica de fora do ranking por unidade: sua unidadeOrigemId é o
// galpão que tinha o estoque, não uma unidade solicitando — rankear não
// responde a mesma pergunta que pros outros 4 tipos.
const TIPOS_RANKING: TipoSolicitacao[] = ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'];

// Relatório 1 — Visão Geral de Solicitações: funil por tipo (em andamento /
// concluída / negada-cancelada), já que os 13 status brutos ficariam
// ilegíveis num gráfico.
export async function visaoGeral(filtros: FiltrosPeriodo & { unidadeIds?: string[]; tipoEquipamentoId?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    ...(filtros.unidadeIds?.length ? { unidadeOrigemId: { in: filtros.unidadeIds } } : {}),
    ...filtroItem(filtros.tipoEquipamentoId),
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

// Relatório 2 (mostrado dentro de Visão Geral) — Ranking de Unidades, com os
// 4 tipos lado a lado por unidade, num gráfico só (feedback do cliente:
// dinâmico, sem precisar escolher um tipo por vez).
export async function rankingUnidades(filtros: FiltrosPeriodo & { unidadeIds?: string[]; tipoEquipamentoId?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: { in: TIPOS_RANKING },
    ...(filtros.unidadeIds?.length ? { unidadeOrigemId: { in: filtros.unidadeIds } } : {}),
    ...filtroItem(filtros.tipoEquipamentoId),
    ...filtroPeriodo(filtros),
  };
  const grupos = await prisma.solicitacao.groupBy({
    by: ['unidadeOrigemId', 'tipo'],
    where,
    _count: { id: true },
  });
  const nomeUnidade = await mapaNomeUnidade();
  const porUnidade = new Map<string, Record<TipoSolicitacao, number>>();
  for (const g of grupos) {
    if (!porUnidade.has(g.unidadeOrigemId)) {
      porUnidade.set(
        g.unidadeOrigemId,
        Object.fromEntries(TIPOS_RANKING.map((t) => [t, 0])) as Record<TipoSolicitacao, number>,
      );
    }
    porUnidade.get(g.unidadeOrigemId)![g.tipo] = g._count.id;
  }
  return Array.from(porUnidade.entries())
    .map(([unidadeId, tipos]) => ({ unidadeId, unidade: nomeUnidade(unidadeId), ...tipos }))
    .sort((a, b) => {
      const totalA = TIPOS_RANKING.reduce((soma, t) => soma + a[t], 0);
      const totalB = TIPOS_RANKING.reduce((soma, t) => soma + b[t], 0);
      return totalB - totalA;
    });
}

// Drill-down do ranking (feedback do stakeholder: clicar numa unidade e ver
// tudo que ela pediu, não só o número agregado) — mesmos 4 tipos do gráfico
// de ranking, filtrável também por item.
export async function detalheUnidade(unidadeId: string, filtros: FiltrosPeriodo & { tipoEquipamentoId?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: { in: TIPOS_RANKING },
    unidadeOrigemId: unidadeId,
    ...filtroItem(filtros.tipoEquipamentoId),
    ...filtroPeriodo(filtros),
  };
  const registros = await prisma.solicitacao.findMany({
    where,
    include: {
      equipamento: { select: { tombamento: true, descricao: true } },
      tipoEquipamento: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });
  return registros.map((s) => ({
    id: s.id,
    tipo: s.tipo,
    item: s.equipamento ? `${s.equipamento.tombamento} — ${s.equipamento.descricao}` : (s.tipoEquipamento?.nome ?? null),
    quantidade: s.quantidade,
    status: s.status,
    criadoEm: s.criadoEm,
  }));
}

// Relatório 3 — Empréstimos: prazos e devoluções. "Atrasado" cobre tanto o
// empréstimo ainda em aberto além do prazo quanto o que já foi devolvido
// depois do prazo (mesma regra do alerta EMPRESTIMO_ATRASADO do dashboard,
// aqui virando dado consultável em vez de só uma mensagem).
export async function emprestimos(
  filtros: FiltrosPeriodo & { unidadeIds?: string[]; tipoEquipamentoId?: string; busca?: string },
) {
  const busca = filtros.busca?.trim();
  // filtroItem já usa "OR" — combina num "AND" de sub-filtros pra não um
  // OR sobrescrever o outro no spread.
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: 'EMPRESTIMO',
    ...(filtros.unidadeIds?.length ? { unidadeOrigemId: { in: filtros.unidadeIds } } : {}),
    ...filtroPeriodo(filtros),
    AND: [
      filtroItem(filtros.tipoEquipamentoId),
      busca
        ? {
            OR: [
              { equipamento: { tombamento: { contains: busca, mode: 'insensitive' } } },
              { equipamento: { descricao: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {},
    ],
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
      equipamento: s.equipamento?.descricao ?? null,
      tombamento: s.equipamento?.tombamento ?? null,
      unidadeOrigem: s.unidadeOrigem.nome,
      unidadeDestino: s.unidadeDestino?.nome ?? null,
      dataRetornoPrevista: s.dataRetornoPrevista,
      status: s.status,
      atrasado,
      criadoEm: s.criadoEm,
    };
  });

  // Mesmo funil de 3 baldes da Visão Geral (em andamento / concluída /
  // negada-cancelada) — pros cards de resumo do relatório.
  const total = itens.length;
  const concluida = itens.filter((i) => i.status === 'CONCLUIDA').length;
  const negadaCancelada = itens.filter((i) => TERMINAL_NEGADA.has(i.status)).length;
  const emAndamento = total - concluida - negadaCancelada;

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

  return { total, emAndamento, concluida, negadaCancelada, percentualAtraso, duracaoMediaDias, itens };
}

// Tipos que reservam do estoque de galpão (Ampliação/Substituição sem ata) —
// mesmo conjunto usado em solicitacoes.service.ts
const TIPOS_COM_ATA = ['AMPLIACAO', 'SUBSTITUICAO'] as const;

// Relatório 4 — Itens e Estoque: o que está represado em
// AGUARDANDO_DISPONIBILIDADE (sem estoque suficiente pra reservar ainda),
// agregado por tipo de equipamento — não é por galpão, já que a solicitação
// ainda não tem um galpão associado. Movido de GET /estoque/aguardando pra
// virar um relatório dedicado (antes vivia dentro da tela de Estoque).
export async function itensEstoque() {
  const grupos = await prisma.solicitacao.groupBy({
    by: ['tipoEquipamentoId'],
    where: {
      status: 'AGUARDANDO_DISPONIBILIDADE',
      tipo: { in: [...TIPOS_COM_ATA] },
    },
    _sum: { quantidade: true },
    _count: { _all: true },
  });
  const ids = grupos.map((g) => g.tipoEquipamentoId).filter((id): id is string => !!id);
  const tipos = await prisma.tipoEquipamento.findMany({
    where: { id: { in: ids } },
    include: { categoria: { select: { nome: true, cor: true } } },
  });
  const tiposPorId = new Map(tipos.map((t) => [t.id, t]));
  return grupos
    .filter((g) => g.tipoEquipamentoId && tiposPorId.has(g.tipoEquipamentoId))
    .map((g) => ({
      tipoEquipamento: tiposPorId.get(g.tipoEquipamentoId as string)!,
      quantidade: g._sum.quantidade ?? 0,
      solicitacoes: g._count._all,
    }))
    .sort((a, b) => a.tipoEquipamento.nome.localeCompare(b.tipoEquipamento.nome, 'pt-BR'));
}

// Tipos que representam "entrega" de um item (Ampliação/Substituição/Cessão
// de Uso pedem um tipo e recebem um item novo pro acervo) — Empréstimo e
// Recolha ficam de fora do resumo por item: são movimentação de um
// equipamento já existente, não entrega de item novo.
const TIPOS_ENTREGA_ITEM: TipoSolicitacao[] = ['AMPLIACAO', 'SUBSTITUICAO', 'CESSAO_USO'];

// Demanda ("aguardando estoque") valorizada — sem um tipoEquipamentoId,
// precisa somar quantidade × preço POR tipo antes de somar o total, já que
// cada tipo tem seu próprio preço (não dá pra multiplicar a quantidade
// agregada por um preço só). Mesma agregação de itensEstoque(), só que
// também retorna o valor total já calculado.
async function calcularDemanda(tipoEquipamentoId?: string) {
  const grupos = await prisma.solicitacao.groupBy({
    by: ['tipoEquipamentoId'],
    where: {
      status: 'AGUARDANDO_DISPONIBILIDADE',
      tipo: { in: [...TIPOS_COM_ATA] },
      ...(tipoEquipamentoId ? { tipoEquipamentoId } : {}),
    },
    _sum: { quantidade: true },
  });
  const ids = grupos.map((g) => g.tipoEquipamentoId).filter((id): id is string => !!id);
  const tipos = await prisma.tipoEquipamento.findMany({ where: { id: { in: ids } }, select: { id: true, preco: true } });
  const precoPorId = new Map(tipos.map((t) => [t.id, t.preco ? Number(t.preco) : 0]));
  let quantidade = 0;
  let valor = 0;
  for (const g of grupos) {
    const qtd = g._sum.quantidade ?? 0;
    quantidade += qtd;
    valor += qtd * (precoPorId.get(g.tipoEquipamentoId as string) ?? 0);
  }
  return { quantidade, valor };
}

// Resumo de item (feedback do stakeholder: "quanto foi entregue, quantos
// pendentes, qual a demanda"). Com tipoEquipamentoId, escopado a um item só
// (ex. purificador de água); sem, agrega todos os itens — pra sempre ter
// esse resumo visível em Visão Geral, filtrado ou não. Reaproveita a mesma
// regra de "em andamento" do funil e a mesma agregação de "aguardando
// estoque" do itensEstoque().
export async function resumoItem(tipoEquipamentoId: string | undefined, filtros: FiltrosPeriodo) {
  const itemNome = tipoEquipamentoId
    ? ((await prisma.tipoEquipamento.findUnique({ where: { id: tipoEquipamentoId } }))?.nome ?? 'Item não encontrado')
    : 'Todos os itens';

  const where: Prisma.SolicitacaoWhereInput = {
    tipo: { in: TIPOS_ENTREGA_ITEM },
    ...(tipoEquipamentoId ? { tipoEquipamentoId } : {}),
    ...filtroPeriodo(filtros),
  };
  const grupos = await prisma.solicitacao.groupBy({ by: ['status'], where, _count: { id: true } });
  let entregue = 0;
  let pendente = 0;
  for (const g of grupos) {
    if (g.status === 'CONCLUIDA') entregue += g._count.id;
    else if (!TERMINAL_NEGADA.has(g.status)) pendente += g._count.id;
  }

  const demanda = await calcularDemanda(tipoEquipamentoId);

  return {
    itemNome,
    entregue,
    pendente,
    demandaQuantidade: demanda.quantidade,
    demandaValor: demanda.valor,
  };
}

// Tipos de Movimentacao que alteram a unidade *permanente* dona do
// equipamento — exclui manutenção e empréstimo, que só mudam status/
// unidadeTemporariaId (RN06: durante empréstimo o tombamento permanece na
// origem). RECOLHA e BAIXA usam unidadeOrigemId (saída); CADASTRO/
// IMPORTACAO_CSV/RECEBIMENTO_GALPAO e RECOLHA usam unidadeDestinoId (entrada).
const TIPOS_MOVIMENTACAO_UNIDADE = ['CADASTRO', 'IMPORTACAO_CSV', 'RECEBIMENTO_GALPAO', 'RECOLHA', 'BAIXA'] as const;

// UTC, não hora local — evita que um timestamp perto da virada do mês
// (ex.: "2026-03-01T00:00:00Z") caia num mês diferente dependendo do fuso
// do servidor.
function chaveMes(data: Date) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Relatório 5 — Itens e Estoque: quantidade de equipamentos por unidade ao
// longo do tempo, reconstruída a partir do log de Movimentacao (não existe
// histórico direto de Equipamento.unidadeId). Valor por mês é o total
// acumulado até o fim daquele mês, mês a mês desde o primeiro evento.
export async function itensPorUnidade(filtros: FiltrosPeriodo & { unidadeIds?: string[] }) {
  const eventos = await prisma.movimentacao.findMany({
    where: { tipo: { in: [...TIPOS_MOVIMENTACAO_UNIDADE] } },
    select: { unidadeOrigemId: true, unidadeDestinoId: true, criadoEm: true },
    orderBy: { criadoEm: 'asc' },
  });
  if (eventos.length === 0) return { unidades: [] as string[], linhas: [] as Array<Record<string, string | number>> };

  const nomeUnidade = await mapaNomeUnidade();
  const filtroUnidades = filtros.unidadeIds?.length ? new Set(filtros.unidadeIds) : null;
  const fim = filtros.dataFim ?? new Date();

  const meses: string[] = [];
  const cursor = new Date(Date.UTC(eventos[0].criadoEm.getUTCFullYear(), eventos[0].criadoEm.getUTCMonth(), 1));
  while (cursor <= fim) {
    meses.push(chaveMes(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const acumulado = new Map<string, number>();
  const porUnidadePorMes = new Map<string, Map<string, number>>();
  function garantirUnidade(id: string) {
    if (!acumulado.has(id)) {
      acumulado.set(id, 0);
      porUnidadePorMes.set(id, new Map());
    }
  }

  let indiceEvento = 0;
  for (const mes of meses) {
    while (indiceEvento < eventos.length && chaveMes(eventos[indiceEvento].criadoEm) <= mes) {
      const ev = eventos[indiceEvento];
      if (ev.unidadeDestinoId) {
        garantirUnidade(ev.unidadeDestinoId);
        acumulado.set(ev.unidadeDestinoId, acumulado.get(ev.unidadeDestinoId)! + 1);
      }
      if (ev.unidadeOrigemId) {
        garantirUnidade(ev.unidadeOrigemId);
        acumulado.set(ev.unidadeOrigemId, acumulado.get(ev.unidadeOrigemId)! - 1);
      }
      indiceEvento++;
    }
    for (const [unidadeId, total] of acumulado) {
      porUnidadePorMes.get(unidadeId)!.set(mes, total);
    }
  }

  const unidadesAtivas = Array.from(porUnidadePorMes.keys()).filter((id) => !filtroUnidades || filtroUnidades.has(id));
  const mesInicio = filtros.dataInicio ? chaveMes(filtros.dataInicio) : meses[0];
  const linhas = meses
    .filter((mes) => mes >= mesInicio)
    .map((mes) => {
      const linha: Record<string, string | number> = { mes };
      for (const unidadeId of unidadesAtivas) {
        linha[nomeUnidade(unidadeId)] = porUnidadePorMes.get(unidadeId)!.get(mes) ?? 0;
      }
      return linha;
    });

  return { unidades: unidadesAtivas.map((id) => nomeUnidade(id)), linhas };
}

// Relatório 6 — Cessões de Uso: prestação de contas (o que foi cedido, pra
// quem, com qual nº de patrimônio).
export async function cessoes(filtros: FiltrosPeriodo & { tipoEquipamentoId?: string; busca?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: 'CESSAO_USO',
    ...filtroItem(filtros.tipoEquipamentoId),
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
  // numerosPatrimonio é String[] — Prisma não faz "contains" de substring
  // dentro de array (só igualdade exata via "has"), então filtra em JS.
  // Volume é baixo (cada cessão já é granular por item).
  const busca = filtros.busca?.trim().toLowerCase();
  const filtrados = busca
    ? registros.filter(
        (s) =>
          s.numerosPatrimonio.some((n) => n.toLowerCase().includes(busca)) ||
          s.entidadeExternaNome?.toLowerCase().includes(busca) ||
          s.tipoEquipamento?.nome.toLowerCase().includes(busca),
      )
    : registros;
  return {
    itens: filtrados.map((s) => ({
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
