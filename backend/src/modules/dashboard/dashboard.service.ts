import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface FiltrosDashboard {
  dataInicio?: Date;
  dataFim?: Date;
  unidadeId?: string;
  tipoEquipamentoId?: string;
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

  // Tempo médio de manutenção (dias)
  const tempos = manutencoesConcluidas
    .filter((m) => m.dataEnvio && m.dataConclusao)
    .map((m) => (m.dataConclusao!.getTime() - m.dataEnvio!.getTime()) / (24 * 60 * 60 * 1000));
  const tempoMedioDias =
    tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;

  // Custo semestral de manutenção (últimos 6 meses, agrupado por mês)
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

// Alertas do painel: atas críticas (RF35) + empréstimos atrasados (FA05)
export async function alertas() {
  const agora = new Date();
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [atas, emprestimosAtrasados] = await Promise.all([
    prisma.ata.findMany({ where: { ativo: true } }),
    prisma.solicitacao.findMany({
      where: {
        tipo: 'EMPRESTIMO',
        status: { in: ['AGUARDANDO_RECEBIMENTO', 'AGUARDANDO_RETORNO'] },
        dataRetornoPrevista: { lt: agora },
      },
      include: {
        equipamento: { select: { tombamento: true } },
        unidadeOrigem: { select: { nome: true } },
        unidadeDestino: { select: { nome: true } },
      },
    }),
  ]);

  const lista: Array<{ tipo: string; severidade: 'AVISO' | 'CRITICO'; mensagem: string }> = [];
  for (const ata of atas) {
    if (ata.vencimento < agora) {
      lista.push({ tipo: 'ATA_VENCIDA', severidade: 'CRITICO', mensagem: `Ata ${ata.numero} está vencida` });
    } else if (ata.vencimento <= em30dias) {
      const dias = Math.ceil((ata.vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
      lista.push({
        tipo: 'ATA_VENCIMENTO',
        severidade: 'AVISO',
        mensagem: `Ata ${ata.numero} vence em ${dias} dia${dias === 1 ? '' : 's'} — saldo restante: R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      });
    }
    const percentual = Number(ata.valorTotal) > 0 ? (Number(ata.saldo) / Number(ata.valorTotal)) * 100 : 0;
    if (percentual < 10 && ata.vencimento >= agora) {
      lista.push({
        tipo: 'ATA_SALDO_BAIXO',
        severidade: 'CRITICO',
        mensagem: `Ata ${ata.numero} com saldo baixo — apenas ${percentual.toFixed(1)}% do saldo disponível (R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      });
    }
  }
  for (const emp of emprestimosAtrasados) {
    lista.push({
      tipo: 'EMPRESTIMO_ATRASADO',
      severidade: 'AVISO',
      mensagem: `Empréstimo do equipamento ${emp.equipamento?.tombamento} (${emp.unidadeOrigem.nome} → ${emp.unidadeDestino?.nome}) está com devolução atrasada`,
    });
  }
  return lista;
}
