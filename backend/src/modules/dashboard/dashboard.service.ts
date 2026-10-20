import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthPayload } from '../../middlewares/auth';
import { comprometidoPorItem, saldoDoItem } from '../contratos/saldo';

export interface FiltrosDashboard {
  dataInicio?: Date;
  dataFim?: Date;
  unidadeId?: string;
  tipoEquipamentoId?: string;
}

export type AlertaHome = {
  tipo: string;
  severidade: 'AVISO' | 'CRITICO';
  mensagem: string;
  contagem: number;
  href: string;
};

function item(
  tipo: string,
  severidade: 'AVISO' | 'CRITICO',
  mensagem: string,
  contagem: number,
  href: string,
): AlertaHome | null {
  if (contagem <= 0) return null;
  return { tipo, severidade, mensagem, contagem, href };
}

function plural(n: number, um: string, varios: string) {
  return n === 1 ? um : varios;
}

// UC21/RF36/RF37 — indicadores consolidados com filtros por período,
// unidade e tipo de equipamento.
export async function indicadores(filtros: FiltrosDashboard) {
  const filtroEquipamento: Prisma.EquipamentoWhereInput = {
    ...(filtros.unidadeId ? { unidadeId: filtros.unidadeId } : {}),
    ...(filtros.tipoEquipamentoId ? { tipoEquipamentoId: filtros.tipoEquipamentoId } : {}),
  };
  const filtroPeriodo =
    filtros.dataInicio || filtros.dataFim
      ? {
          criadoEm: {
            ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
            ...(filtros.dataFim ? { lte: filtros.dataFim } : {}),
          },
        }
      : {};

  const [totalEquipamentos, emManutencao, manutencoesConcluidas, porUnidade, ranking] =
    await Promise.all([
      prisma.equipamento.count({ where: { ...filtroEquipamento, status: { not: 'BAIXADO' } } }),
      prisma.equipamento.count({ where: { ...filtroEquipamento, status: 'EM_MANUTENCAO' } }),
      prisma.manutencao.findMany({
        where: {
          status: 'CONCLUIDA',
          dataEnvio: { not: null },
          dataConclusao: { not: null },
          ...(filtros.unidadeId ? { unidadeId: filtros.unidadeId } : {}),
          ...(filtros.tipoEquipamentoId
            ? { equipamento: { tipoEquipamentoId: filtros.tipoEquipamentoId } }
            : {}),
          ...filtroPeriodo,
        },
        select: { dataEnvio: true, dataConclusao: true, custoFinal: true },
      }),
      prisma.equipamento.groupBy({
        by: ['unidadeId'],
        where: { ...filtroEquipamento, status: { not: 'BAIXADO' } },
        _count: { id: true },
      }),
      prisma.solicitacao.groupBy({
        by: ['unidadeOrigemId'],
        where: filtroPeriodo,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

  const tempos = manutencoesConcluidas
    .filter((m) => m.dataEnvio && m.dataConclusao)
    .map((m) => (m.dataConclusao!.getTime() - m.dataEnvio!.getTime()) / (24 * 60 * 60 * 1000));
  const tempoMedioDias =
    tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;

  const seisMesesAtras = new Date();
  seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
  seisMesesAtras.setDate(1);
  seisMesesAtras.setHours(0, 0, 0, 0);
  const manutencoesSemestre = await prisma.manutencao.findMany({
    where: {
      custoFinal: { not: null },
      dataConclusao: { gte: seisMesesAtras },
      ...(filtros.unidadeId ? { unidadeId: filtros.unidadeId } : {}),
      ...(filtros.tipoEquipamentoId
        ? { equipamento: { tipoEquipamentoId: filtros.tipoEquipamentoId } }
        : {}),
    },
    select: { custoFinal: true, dataConclusao: true },
  });
  const custoPorMes = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const d = new Date(seisMesesAtras);
    d.setMonth(d.getMonth() + i);
    custoPorMes.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
  }
  let custoMesAtual = 0;
  const mesAtualChave = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  for (const m of manutencoesSemestre) {
    const d = m.dataConclusao!;
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (custoPorMes.has(chave)) {
      custoPorMes.set(chave, custoPorMes.get(chave)! + Number(m.custoFinal));
    }
    if (chave === mesAtualChave) custoMesAtual += Number(m.custoFinal);
  }

  const unidades = await prisma.unidade.findMany({ select: { id: true, nome: true } });
  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? 'Desconhecida';

  return {
    totalEquipamentos,
    emManutencao,
    tempoMedioManutencaoDias: tempoMedioDias,
    custoMesAtual,
    custoSemestral: Array.from(custoPorMes.entries()).map(([mes, custo]) => ({ mes, custo })),
    equipamentosPorUnidade: porUnidade
      .map((g) => ({
        unidadeId: g.unidadeId,
        unidade: nomeUnidade(g.unidadeId),
        quantidade: g._count.id,
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
    rankingSolicitacoes: ranking.map((g) => ({
      unidadeId: g.unidadeOrigemId,
      unidade: nomeUnidade(g.unidadeOrigemId),
      quantidade: g._count.id,
    })),
  };
}

async function alertasOperador(): Promise<AlertaHome[]> {
  const agora = new Date();
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    pendenteSol,
    pendenteMan,
    orcamento,
    providencias,
    medicao,
    reencaminhamento,
    branet,
    validacao,
    estoqueDemanda,
    retornoManut,
    emprestimosAtrasados,
    atas,
    contratos,
  ] = await Promise.all([
    prisma.solicitacao.count({ where: { status: 'PENDENTE_APROVACAO' } }),
    prisma.manutencao.count({ where: { status: 'PENDENTE_APROVACAO' } }),
    prisma.manutencao.count({ where: { status: 'ORCAMENTO_REGISTRADO' } }),
    prisma.manutencao.count({ where: { status: 'AGUARDANDO_PROVIDENCIAS' } }),
    prisma.manutencao.count({ where: { status: 'AGUARDANDO_MEDICAO' } }),
    prisma.manutencao.count({ where: { status: 'REENCAMINHAMENTO_SOLICITADO' } }),
    prisma.solicitacao.count({ where: { status: 'RESERVADO' } }),
    prisma.solicitacao.count({ where: { status: 'AGUARDANDO_VALIDACAO' } }),
    prisma.solicitacao.count({ where: { status: 'AGUARDANDO_DISPONIBILIDADE' } }),
    prisma.manutencao.count({
      where: { tipo: 'EQUIPAMENTO', status: 'AGUARDANDO_RETORNO', confirmadoGestor: false },
    }),
    prisma.solicitacao.count({
      where: {
        tipo: 'EMPRESTIMO',
        status: 'AGUARDANDO_RETORNO',
        dataRetornoPrevista: { lt: agora },
      },
    }),
    prisma.ata.findMany({ where: { ativo: true } }),
    prisma.contrato.findMany({
      where: { ativo: true },
      include: { itens: { select: { id: true, valor: true } } },
    }),
  ]);

  const lista: AlertaHome[] = [];
  const decisao = pendenteSol + pendenteMan;
  const push = (a: AlertaHome | null) => {
    if (a) lista.push(a);
  };

  push(
    item(
      'FILA_DECISAO',
      'AVISO',
      `${decisao} ${plural(decisao, 'pedido aguardando sua decisão', 'pedidos aguardando sua decisão')}`,
      decisao,
      '/solicitacoes?status=PENDENTE_APROVACAO',
    ),
  );
  push(
    item(
      'FILA_ORCAMENTO',
      'AVISO',
      `${orcamento} ${plural(orcamento, 'orçamento aguardando decisão', 'orçamentos aguardando decisão')}`,
      orcamento,
      '/solicitacoes?tipo=MANUTENCAO&status=ORCAMENTO_REGISTRADO',
    ),
  );
  push(
    item(
      'FILA_PROVIDENCIAS',
      'AVISO',
      `${providencias} ${plural(providencias, 'chamado civil aguardando providências', 'chamados civis aguardando providências')}`,
      providencias,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_PROVIDENCIAS',
    ),
  );
  push(
    item(
      'FILA_MEDICAO',
      'AVISO',
      `${medicao} ${plural(medicao, 'chamado aguardando autorização de medição', 'chamados aguardando autorização de medição')}`,
      medicao,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_MEDICAO',
    ),
  );
  push(
    item(
      'FILA_REENCAMINHAMENTO',
      'AVISO',
      `${reencaminhamento} ${plural(reencaminhamento, 'chamado com reencaminhamento a decidir', 'chamados com reencaminhamento a decidir')}`,
      reencaminhamento,
      '/solicitacoes?tipo=MANUTENCAO&status=REENCAMINHAMENTO_SOLICITADO',
    ),
  );
  push(
    item(
      'FILA_BRANET',
      'AVISO',
      `${branet} ${plural(branet, 'pedido reservado aguardando lançamento no Branet', 'pedidos reservados aguardando lançamento no Branet')}`,
      branet,
      '/solicitacoes?status=RESERVADO',
    ),
  );
  push(
    item(
      'FILA_VALIDACAO',
      'AVISO',
      `${validacao} ${plural(validacao, 'pedido aguardando validação', 'pedidos aguardando validação')}`,
      validacao,
      '/solicitacoes?status=AGUARDANDO_VALIDACAO',
    ),
  );
  push(
    item(
      'FILA_ESTOQUE_DEMANDA',
      'AVISO',
      `${estoqueDemanda} ${plural(estoqueDemanda, 'pedido aguardando disponibilidade de estoque', 'pedidos aguardando disponibilidade de estoque')}`,
      estoqueDemanda,
      '/solicitacoes?status=AGUARDANDO_DISPONIBILIDADE',
    ),
  );
  push(
    item(
      'FILA_RETORNO_MANUT',
      'AVISO',
      `${retornoManut} ${plural(retornoManut, 'retorno de manutenção aguardando sua confirmação', 'retornos de manutenção aguardando sua confirmação')}`,
      retornoManut,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_RETORNO',
    ),
  );
  push(
    item(
      'EMPRESTIMO_ATRASADO',
      'CRITICO',
      `${emprestimosAtrasados} ${plural(emprestimosAtrasados, 'empréstimo com devolução atrasada', 'empréstimos com devolução atrasada')}`,
      emprestimosAtrasados,
      '/solicitacoes?tipo=EMPRESTIMO&status=AGUARDANDO_RETORNO',
    ),
  );

  for (const ata of atas) {
    if (ata.vencimento < agora) {
      lista.push({
        tipo: 'ATA_VENCIDA',
        severidade: 'CRITICO',
        mensagem: `Ata ${ata.numero} está vencida`,
        contagem: 1,
        href: '/atas',
      });
    } else if (ata.vencimento <= em30dias) {
      const dias = Math.ceil((ata.vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
      lista.push({
        tipo: 'ATA_VENCIMENTO',
        severidade: 'AVISO',
        mensagem: `Ata ${ata.numero} vence em ${dias} dia${dias === 1 ? '' : 's'}`,
        contagem: 1,
        href: '/atas',
      });
    }
    const percentual = Number(ata.valorTotal) > 0 ? (Number(ata.saldo) / Number(ata.valorTotal)) * 100 : 0;
    if (percentual < 10 && ata.vencimento >= agora) {
      lista.push({
        tipo: 'ATA_SALDO_BAIXO',
        severidade: 'CRITICO',
        mensagem: `Ata ${ata.numero} com saldo baixo (${percentual.toFixed(1)}%)`,
        contagem: 1,
        href: '/atas',
      });
    }
  }

  lista.push(...(await alertasContratos(contratos, agora, em30dias)));
  return ordenarAlertas(lista);
}

async function alertasContratos(
  contratos: Array<{
    id: string;
    numero: string;
    status: string;
    vigenciaFim: Date;
    valorTotal: Prisma.Decimal | number | string | null;
    itens: Array<{ id: string; valor: Prisma.Decimal | number | string }>;
  }>,
  agora: Date,
  em30dias: Date,
): Promise<AlertaHome[]> {
  const lista: AlertaHome[] = [];
  const listaContratos = contratos ?? [];
  const itemIds = listaContratos.flatMap((c) => c.itens.map((i) => i.id));
  const comprometido = await comprometidoPorItem(prisma, itemIds);

  for (const contrato of listaContratos) {
    const vencidoPorData = contrato.vigenciaFim < agora;
    const expirado = contrato.status === 'EXPIRADO' || vencidoPorData;
    if (expirado) {
      lista.push({
        tipo: 'CONTRATO_EXPIRADO',
        severidade: 'CRITICO',
        mensagem: `Contrato ${contrato.numero} está expirado`,
        contagem: 1,
        href: '/contratos',
      });
    } else if (contrato.vigenciaFim <= em30dias) {
      const dias = Math.ceil((contrato.vigenciaFim.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
      lista.push({
        tipo: 'CONTRATO_VENCIMENTO',
        severidade: 'AVISO',
        mensagem: `Contrato ${contrato.numero} vence em ${dias} dia${dias === 1 ? '' : 's'}`,
        contagem: 1,
        href: '/contratos',
      });
    } else if (contrato.status === 'RENOVACAO_PENDENTE') {
      lista.push({
        tipo: 'CONTRATO_RENOVACAO',
        severidade: 'AVISO',
        mensagem: `Contrato ${contrato.numero} com renovação pendente`,
        contagem: 1,
        href: '/contratos',
      });
    }

    const valorTotal =
      contrato.valorTotal === null || contrato.valorTotal === undefined
        ? null
        : Number(contrato.valorTotal);
    if (valorTotal !== null && valorTotal > 0 && contrato.itens.length > 0 && !vencidoPorData) {
      const saldo = contrato.itens.reduce(
        (soma, i) => soma + saldoDoItem(i.valor, comprometido.get(i.id) ?? 0),
        0,
      );
      if (saldo / valorTotal < 0.1) {
        lista.push({
          tipo: 'CONTRATO_SALDO_BAIXO',
          severidade: 'CRITICO',
          mensagem: `Contrato ${contrato.numero} com saldo baixo (${((saldo / valorTotal) * 100).toFixed(1)}%)`,
          contagem: 1,
          href: '/contratos',
        });
      }
    }
  }
  return lista;
}

async function alertasUnidade(unidadeId: string): Promise<AlertaHome[]> {
  const [
    recebimento,
    recolha,
    saidaEmprestimo,
    retornoEmprestimo,
    retornoManut,
  ] = await Promise.all([
    prisma.solicitacao.count({
      where: {
        unidadeOrigemId: unidadeId,
        status: 'AGUARDANDO_ENTREGA',
        tipo: { in: ['AMPLIACAO', 'SUBSTITUICAO'] },
      },
    }),
    prisma.solicitacao.count({
      where: { unidadeOrigemId: unidadeId, status: 'AGUARDANDO_ENTREGA', tipo: 'RECOLHA' },
    }),
    prisma.solicitacao.count({
      where: { unidadeOrigemId: unidadeId, status: 'AGUARDANDO_SAIDA', tipo: 'EMPRESTIMO' },
    }),
    prisma.solicitacao.count({
      where: { unidadeOrigemId: unidadeId, status: 'AGUARDANDO_RETORNO', tipo: 'EMPRESTIMO' },
    }),
    prisma.manutencao.count({
      where: { unidadeId, status: 'AGUARDANDO_RETORNO', confirmadoUnidade: false },
    }),
  ]);

  const lista: AlertaHome[] = [];
  const push = (a: AlertaHome | null) => {
    if (a) lista.push(a);
  };
  push(
    item(
      'FILA_RECEBIMENTO',
      'AVISO',
      `${recebimento} ${plural(recebimento, 'item aguardando confirmação de recebimento', 'itens aguardando confirmação de recebimento')}`,
      recebimento,
      '/solicitacoes?status=AGUARDANDO_ENTREGA',
    ),
  );
  push(
    item(
      'FILA_RECOLHA',
      'AVISO',
      `${recolha} ${plural(recolha, 'recolha aguardando sua confirmação', 'recolhas aguardando sua confirmação')}`,
      recolha,
      '/solicitacoes?tipo=RECOLHA&status=AGUARDANDO_ENTREGA',
    ),
  );
  push(
    item(
      'FILA_SAIDA_EMPRESTIMO',
      'AVISO',
      `${saidaEmprestimo} ${plural(saidaEmprestimo, 'empréstimo aguardando confirmação de saída', 'empréstimos aguardando confirmação de saída')}`,
      saidaEmprestimo,
      '/solicitacoes?tipo=EMPRESTIMO&status=AGUARDANDO_SAIDA',
    ),
  );
  push(
    item(
      'FILA_RETORNO_EMPRESTIMO',
      'AVISO',
      `${retornoEmprestimo} ${plural(retornoEmprestimo, 'empréstimo aguardando confirmação de retorno', 'empréstimos aguardando confirmação de retorno')}`,
      retornoEmprestimo,
      '/solicitacoes?tipo=EMPRESTIMO&status=AGUARDANDO_RETORNO',
    ),
  );
  push(
    item(
      'FILA_RETORNO_MANUT',
      'AVISO',
      `${retornoManut} ${plural(retornoManut, 'manutenção aguardando sua confirmação de retorno', 'manutenções aguardando sua confirmação de retorno')}`,
      retornoManut,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_RETORNO',
    ),
  );
  return ordenarAlertas(lista);
}

async function alertasGalpao(unidadeId: string): Promise<AlertaHome[]> {
  const estoques = await prisma.estoqueGalpao.findMany({
    where: { unidadeId },
    select: { quantidade: true },
  });
  const esgotado = estoques.filter((e) => e.quantidade === 0).length;
  const baixo = estoques.filter((e) => e.quantidade > 0 && e.quantidade <= 3).length;
  const lista: AlertaHome[] = [];
  const push = (a: AlertaHome | null) => {
    if (a) lista.push(a);
  };
  push(
    item(
      'ESTOQUE_ESGOTADO',
      'CRITICO',
      `${esgotado} ${plural(esgotado, 'item com estoque zero', 'itens com estoque zero')}`,
      esgotado,
      '/estoque',
    ),
  );
  push(
    item(
      'ESTOQUE_BAIXO',
      'AVISO',
      `${baixo} ${plural(baixo, 'item com estoque baixo', 'itens com estoque baixo')}`,
      baixo,
      '/estoque',
    ),
  );
  return ordenarAlertas(lista);
}

async function alertasTerceirizada(prestadorId: string): Promise<AlertaHome[]> {
  const agora = new Date();
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
  const filtroPrestador = { contrato: { prestadorId } };

  const [orcamento, iniciar, emExecucao, contratos] = await Promise.all([
    prisma.manutencao.count({ where: { ...filtroPrestador, status: 'AGUARDANDO_ORCAMENTO' } }),
    prisma.manutencao.count({ where: { ...filtroPrestador, status: 'AGUARDANDO_EXECUCAO' } }),
    prisma.manutencao.count({ where: { ...filtroPrestador, status: 'EM_EXECUCAO' } }),
    prisma.contrato.findMany({
      where: { ativo: true, prestadorId },
      include: { itens: { select: { id: true, valor: true } } },
    }),
  ]);

  const lista: AlertaHome[] = [];
  const push = (a: AlertaHome | null) => {
    if (a) lista.push(a);
  };
  push(
    item(
      'FILA_ORCAMENTO_PRESTADOR',
      'AVISO',
      `${orcamento} ${plural(orcamento, 'chamado aguardando orçamento', 'chamados aguardando orçamento')}`,
      orcamento,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_ORCAMENTO',
    ),
  );
  push(
    item(
      'FILA_INICIAR_EXECUCAO',
      'AVISO',
      `${iniciar} ${plural(iniciar, 'chamado aguardando início da execução', 'chamados aguardando início da execução')}`,
      iniciar,
      '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_EXECUCAO',
    ),
  );
  push(
    item(
      'FILA_EM_EXECUCAO',
      'AVISO',
      `${emExecucao} ${plural(emExecucao, 'chamado em execução', 'chamados em execução')}`,
      emExecucao,
      '/solicitacoes?tipo=MANUTENCAO&status=EM_EXECUCAO',
    ),
  );
  lista.push(...(await alertasContratos(contratos, agora, em30dias)));
  return ordenarAlertas(lista);
}

function ordenarAlertas(lista: AlertaHome[]) {
  const peso = (s: AlertaHome['severidade']) => (s === 'CRITICO' ? 0 : 1);
  return [...lista].sort((a, b) => peso(a.severidade) - peso(b.severidade) || a.tipo.localeCompare(b.tipo));
}

/** Pendências e riscos da Home, filtrados pelo perfil e escopo do token. */
export async function alertas(usuario: AuthPayload): Promise<AlertaHome[]> {
  switch (usuario.perfil) {
    case Perfil.OPERADOR:
      return alertasOperador();
    case Perfil.UNIDADE:
      return usuario.unidadeId ? alertasUnidade(usuario.unidadeId) : [];
    case Perfil.GALPAO:
      return usuario.unidadeId ? alertasGalpao(usuario.unidadeId) : [];
    case Perfil.TERCEIRIZADA:
      return usuario.prestadorId ? alertasTerceirizada(usuario.prestadorId) : [];
    default:
      return [];
  }
}
