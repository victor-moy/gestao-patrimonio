import { Prisma, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { numeroDaBusca } from '../../lib/numero';

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

function filtroPeriodoManutencao(filtros: FiltrosPeriodo): Prisma.ManutencaoWhereInput {
  if (!filtros.dataInicio && !filtros.dataFim) return {};
  return {
    criadoEm: {
      ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
      ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
    },
  };
}

// Manutenção entra na Visão Geral como mais um "tipo", ao lado dos 5 tipos de solicitação.
export type TipoVisaoGeral = TipoSolicitacao | 'MANUTENCAO';

// Mesmos filtros das solicitações, traduzidos para a manutenção (unidade, item do equipamento e período).
function filtroManutencao(filtros: FiltrosPeriodo & { unidadeIds?: string[]; tipoEquipamentoId?: string }): Prisma.ManutencaoWhereInput {
  return {
    ...(filtros.unidadeIds?.length ? { unidadeId: { in: filtros.unidadeIds } } : {}),
    ...(filtros.tipoEquipamentoId ? { equipamento: { tipoEquipamentoId: filtros.tipoEquipamentoId } } : {}),
    ...filtroPeriodoManutencao(filtros),
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
  const manutencoes = { emAndamento: 0, concluida: 0, negadaCancelada: 0 };
  const gruposManutencao = await prisma.manutencao.groupBy({ by: ['status'], where: filtroManutencao(filtros), _count: { id: true } });
  for (const g of gruposManutencao ?? []) {
    if (g.status === 'CONCLUIDA') manutencoes.concluida += g._count.id;
    // Negada e baixada não são sucesso: contam como "canceladas", como as solicitações negadas
    else if (g.status === 'NEGADA' || g.status === 'BAIXADO') manutencoes.negadaCancelada += g._count.id;
    else manutencoes.emAndamento += g._count.id;
  }
  return [
    ...TODOS_TIPOS.map((tipo) => ({ tipo: tipo as TipoVisaoGeral, ...porTipo.get(tipo)! })),
    { tipo: 'MANUTENCAO' as TipoVisaoGeral, ...manutencoes },
  ];
}

// Relatório 2 (mostrado dentro de Visão Geral) — Ranking de Unidades, com os
// 4 tipos de solicitação mais a manutenção lado a lado por unidade, num gráfico só (feedback do cliente:
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
  const gruposManutencao = await prisma.manutencao.groupBy({
    by: ['unidadeId'],
    where: filtroManutencao(filtros),
    _count: { id: true },
  });
  const nomeUnidade = await mapaNomeUnidade();
  type Contagens = Record<(typeof TIPOS_RANKING)[number] | 'MANUTENCAO', number>;
  const vazio = () =>
    Object.fromEntries([...TIPOS_RANKING, 'MANUTENCAO'].map((t) => [t, 0])) as Contagens;
  const porUnidade = new Map<string, Contagens>();
  for (const g of grupos) {
    if (!porUnidade.has(g.unidadeOrigemId)) porUnidade.set(g.unidadeOrigemId, vazio());
    porUnidade.get(g.unidadeOrigemId)![g.tipo as (typeof TIPOS_RANKING)[number]] = g._count.id;
  }
  for (const g of gruposManutencao ?? []) {
    if (!porUnidade.has(g.unidadeId)) porUnidade.set(g.unidadeId, vazio());
    porUnidade.get(g.unidadeId)!.MANUTENCAO = g._count.id;
  }
  const total = (c: Contagens) => Object.values(c).reduce((soma, n) => soma + n, 0);
  return Array.from(porUnidade.entries())
    .map(([unidadeId, tipos]) => ({ unidadeId, unidade: nomeUnidade(unidadeId), ...tipos }))
    .sort((a, b) => total(b) - total(a));
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
              { titulo: { contains: busca, mode: 'insensitive' } },
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
      numero: s.numero,
      titulo: s.titulo,
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

  return { total, emAndamento, concluida, negadaCancelada, percentualAtraso, itens };
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
    // Mais antiga solicitação ainda represada nesse tipo — junto com a
    // quantidade, é o que orienta prioridade entre pedidos (RN: antiguidade
    // + prioridade manual do Administrador).
    _min: { criadoEm: true },
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
      aguardandoDesde: g._min.criadoEm,
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

// Relatório 6 — Cessões de Uso: prestação de contas (o que foi cedido, pra
// quem, com qual nº de patrimônio). Diferente de Empréstimo/Ampliação, o
// fluxo de Cessão só tem 2 estados na prática (reserva na criação, sem etapa
// de aprovação nem cancelamento): RESERVADO até o Administrador lançar no Branet, e
// CONCLUIDA depois disso — por isso não há balde de negada/cancelada aqui.
export async function cessoes(
  filtros: FiltrosPeriodo & { unidadeIds?: string[]; tipoEquipamentoId?: string; busca?: string },
) {
  const where: Prisma.SolicitacaoWhereInput = {
    tipo: 'CESSAO_USO',
    ...(filtros.unidadeIds?.length ? { unidadeOrigemId: { in: filtros.unidadeIds } } : {}),
    ...filtroItem(filtros.tipoEquipamentoId),
    ...filtroPeriodo(filtros),
  };
  const registros = await prisma.solicitacao.findMany({
    where,
    include: {
      tipoEquipamento: { select: { nome: true, preco: true } },
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
          s.titulo?.toLowerCase().includes(busca) ||
          s.numerosPatrimonio.some((n) => n.toLowerCase().includes(busca)) ||
          s.entidadeExternaNome?.toLowerCase().includes(busca) ||
          s.tipoEquipamento?.nome.toLowerCase().includes(busca),
      )
    : registros;

  const total = filtrados.length;
  const concluida = filtrados.filter((s) => s.status === 'CONCLUIDA').length;
  const aguardandoBranet = total - concluida;
  const valorTotal = filtrados.reduce((soma, s) => soma + (s.tipoEquipamento?.preco ? Number(s.tipoEquipamento.preco) : 0), 0);

  return {
    total,
    concluida,
    aguardandoBranet,
    valorTotal,
    itens: filtrados.map((s) => ({
      id: s.id,
      numero: s.numero,
      titulo: s.titulo,
      entidadeExternaNome: s.entidadeExternaNome,
      tipoEquipamento: s.tipoEquipamento?.nome ?? null,
      numerosPatrimonio: s.numerosPatrimonio,
      preco: s.tipoEquipamento?.preco ? Number(s.tipoEquipamento.preco) : null,
      unidadeOrigem: s.unidadeOrigem.nome,
      status: s.status,
      numeroPedidoBranet: s.numeroPedidoBranet,
      dataConclusao: s.pedidoEntregaRegistradoEm,
      criadoEm: s.criadoEm,
    })),
  };
}

// Relatório 7 — Manutenções: custo, prazo, prestadores e itens que mais geram manutenção.
// Os 4 baldes são os mesmos do funil de solicitações, mais "baixada" separada (equipamento perdido).
const STATUS_ANDAMENTO = ['PENDENTE_APROVACAO', 'AGUARDANDO_PROVIDENCIAS', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'AGUARDANDO_EXECUCAO', 'EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO'] as const;
export type SituacaoManutencao = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NEGADA' | 'BAIXADO';

// Os agregados somam até este limite de registros (os mais recentes); a tabela mostra só os primeiros.
const LIMITE_AGREGACAO_MANUTENCOES = 5000;
const LIMITE_TABELA_MANUTENCOES = 200;
const DIA_MS = 24 * 60 * 60 * 1000;

function statusDaSituacao(situacao?: SituacaoManutencao): Prisma.ManutencaoWhereInput {
  if (!situacao) return {};
  if (situacao === 'EM_ANDAMENTO') return { status: { in: [...STATUS_ANDAMENTO] } };
  return { status: situacao };
}

const ROTULO_CATEGORIA_CIVIL: Record<string, string> = {
  HIDRAULICA: 'Hidráulica',
  ELETRICA: 'Elétrica',
  INFILTRACAO: 'Infiltração',
  ALVENARIA_PINTURA: 'Alvenaria e pintura',
  COBERTURA: 'Cobertura',
  ESQUADRIAS_VIDROS: 'Esquadrias e vidros',
  CLIMATIZACAO_CIVIL: 'Climatização',
  OUTROS: 'Outros',
};

const arredondar = (n: number) => Math.round(n * 100) / 100;

export async function manutencoes(
  filtros: FiltrosPeriodo & {
    unidadeIds?: string[];
    tipoEquipamentoId?: string;
    prestadorId?: string;
    tipoManutencao?: 'EQUIPAMENTO' | 'CIVIL';
    situacao?: SituacaoManutencao;
    busca?: string;
  },
) {
  const busca = filtros.busca?.trim();
  const numero = busca ? numeroDaBusca(busca, 'MAN') : null;
  const where: Prisma.ManutencaoWhereInput = {
    ...(filtros.unidadeIds?.length ? { unidadeId: { in: filtros.unidadeIds } } : {}),
    ...(filtros.tipoEquipamentoId ? { equipamento: { tipoEquipamentoId: filtros.tipoEquipamentoId } } : {}),
    ...(filtros.tipoManutencao ? { tipo: filtros.tipoManutencao } : {}),
    ...(filtros.prestadorId ? { contrato: { prestadorId: filtros.prestadorId } } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? {
          criadoEm: {
            ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
            ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
          },
        }
      : {}),
    ...statusDaSituacao(filtros.situacao),
    ...(busca
      ? {
          OR: [
            ...(numero !== null ? [{ numero }] : []),
            { titulo: { contains: busca, mode: 'insensitive' as const } },
            { descricaoProblema: { contains: busca, mode: 'insensitive' as const } },
            { localAfetado: { contains: busca, mode: 'insensitive' as const } },
            { equipamento: { tombamento: { contains: busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const registros = await prisma.manutencao.findMany({
    where,
    select: {
      id: true,
      numero: true,
      titulo: true,
      status: true,
      tipo: true,
      localAfetado: true,
      categoriaCivil: true,
      criadoEm: true,
      dataConclusao: true,
      orcamentoValor: true,
      custoFinal: true,
      unidade: { select: { nome: true } },
      equipamento: {
        select: {
          tombamento: true,
          descricao: true,
          tipoEquipamentoId: true,
          tipoEquipamento: { select: { nome: true, preco: true } },
        },
      },
      contrato: { select: { numero: true, prestadorId: true, prestador: { select: { nome: true } } } },
    },
    orderBy: { criadoEm: 'desc' },
    take: LIMITE_AGREGACAO_MANUTENCOES,
  });

  let emAndamento = 0;
  let concluidas = 0;
  let negadas = 0;
  let baixadas = 0;
  let custoTotal = 0;
  let orcamentosAltos = 0;
  let somaDias = 0;
  const porMes = new Map<string, { quantidade: number; custo: number }>();
  const porPrestador = new Map<string, { prestador: string; quantidade: number; custo: number }>();
  const porItem = new Map<string, { nome: string; quantidade: number; custo: number }>();

  const linhas = registros.map((m) => {
    const orcamento = m.orcamentoValor === null ? null : Number(m.orcamentoValor);
    const custoFinal = m.custoFinal === null ? null : Number(m.custoFinal);
    const precoBruto = m.equipamento?.tipoEquipamento.preco ?? null;
    const preco = precoBruto === null ? null : Number(precoBruto);
    // Mesma regra do alerta da tela de manutenção: orçamento a partir de 50% do preço de referência
    const naoSugerida = orcamento !== null && preco !== null && preco > 0 && orcamento >= preco * 0.5;
    // Negadas e baixadas não geram gasto; o resto vale o custo final ou, enquanto não há, o orçamento
    const consome = m.status !== 'NEGADA' && m.status !== 'BAIXADO';
    const custo = consome ? (custoFinal ?? orcamento ?? 0) : 0;

    if (m.status === 'CONCLUIDA') {
      concluidas += 1;
      if (m.dataConclusao) somaDias += Math.max(0, (m.dataConclusao.getTime() - m.criadoEm.getTime()) / DIA_MS);
    } else if (m.status === 'NEGADA') negadas += 1;
    else if (m.status === 'BAIXADO') baixadas += 1;
    else emAndamento += 1;
    custoTotal += custo;
    if (naoSugerida) orcamentosAltos += 1;

    const mes = m.criadoEm.toISOString().slice(0, 7);
    const doMes = porMes.get(mes) ?? { quantidade: 0, custo: 0 };
    porMes.set(mes, { quantidade: doMes.quantidade + 1, custo: doMes.custo + custo });

    const prestadorId = m.contrato?.prestadorId ?? 'sem-prestador';
    const doPrestador = porPrestador.get(prestadorId) ?? {
      prestador: m.contrato?.prestador.nome ?? 'Sem contrato',
      quantidade: 0,
      custo: 0,
    };
    porPrestador.set(prestadorId, { ...doPrestador, quantidade: doPrestador.quantidade + 1, custo: doPrestador.custo + custo });

    // Chamado civil agrupa pela categoria do problema (não há tipo de equipamento)
    const tipoId = m.equipamento ? m.equipamento.tipoEquipamentoId : `civil:${m.categoriaCivil ?? 'OUTROS'}`;
    const nomeItem = m.equipamento
      ? m.equipamento.tipoEquipamento.nome
      : `Civil · ${ROTULO_CATEGORIA_CIVIL[m.categoriaCivil ?? 'OUTROS']}`;
    const doItem = porItem.get(tipoId) ?? { nome: nomeItem, quantidade: 0, custo: 0 };
    porItem.set(tipoId, { ...doItem, quantidade: doItem.quantidade + 1, custo: doItem.custo + custo });

    return {
      id: m.id,
      numero: m.numero,
      titulo: m.titulo,
      status: m.status,
      tipo: m.tipo,
      equipamento: m.equipamento?.descricao ?? m.localAfetado ?? '',
      tombamento: m.equipamento?.tombamento ?? null,
      unidade: m.unidade.nome,
      prestador: m.contrato?.prestador.nome ?? null,
      contrato: m.contrato?.numero ?? null,
      orcamento,
      custoFinal,
      naoSugerida,
      criadoEm: m.criadoEm,
      dataConclusao: m.dataConclusao,
    };
  });

  return {
    total: registros.length,
    truncado: registros.length >= LIMITE_AGREGACAO_MANUTENCOES,
    emAndamento,
    concluidas,
    negadas,
    baixadas,
    custoTotal: arredondar(custoTotal),
    tempoMedioDias: concluidas > 0 ? Math.round((somaDias / concluidas) * 10) / 10 : null,
    orcamentosAltos,
    porMes: [...porMes.entries()]
      .map(([mes, v]) => ({ mes, quantidade: v.quantidade, custo: arredondar(v.custo) }))
      .sort((a, b) => a.mes.localeCompare(b.mes)),
    porPrestador: [...porPrestador.entries()]
      .map(([prestadorId, v]) => ({ prestadorId, prestador: v.prestador, quantidade: v.quantidade, custo: arredondar(v.custo) }))
      .sort((a, b) => b.quantidade - a.quantidade || b.custo - a.custo),
    porItem: [...porItem.entries()]
      .map(([tipoEquipamentoId, v]) => ({ tipoEquipamentoId, nome: v.nome, quantidade: v.quantidade, custo: arredondar(v.custo) }))
      .sort((a, b) => b.quantidade - a.quantidade || b.custo - a.custo)
      .slice(0, 8),
    itensTotal: linhas.length,
    itens: linhas.slice(0, LIMITE_TABELA_MANUTENCOES),
  };
}
