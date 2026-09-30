import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { prisma } from '../../lib/prisma';
import * as relatorios from '../relatorios/relatorios.service';

// Cada tool é um wrapper fino em cima de uma função que já existe em
// relatorios.service.ts — reaproveita toda a agregação (e o RBAC da rota
// /assistente, que é o mesmo dos relatórios). Os handlers ficam separados do
// wrapper betaZodTool pra dar pra testar direto, sem depender do formato
// interno do SDK.

function filtroPeriodo(dataInicio?: string, dataFim?: string) {
  return {
    dataInicio: dataInicio ? new Date(dataInicio) : undefined,
    dataFim: dataFim ? new Date(dataFim) : undefined,
  };
}

export async function handleItensAguardandoEstoque() {
  return JSON.stringify(await relatorios.itensEstoque());
}

export async function handleResumoItem(input: { tipoEquipamentoId?: string; dataInicio?: string; dataFim?: string }) {
  const resumo = await relatorios.resumoItem(input.tipoEquipamentoId, filtroPeriodo(input.dataInicio, input.dataFim));
  return JSON.stringify(resumo);
}

export async function handleBuscarTipoEquipamento(input: { nome: string }) {
  const tipos = await prisma.tipoEquipamento.findMany({
    where: { nome: { contains: input.nome, mode: 'insensitive' } },
    select: { id: true, nome: true, codigo: true },
    take: 10,
  });
  return JSON.stringify(tipos);
}

export async function handleVisaoGeralSolicitacoes(input: { dataInicio?: string; dataFim?: string; unidadeId?: string }) {
  const visaoGeral = await relatorios.visaoGeral({
    ...filtroPeriodo(input.dataInicio, input.dataFim),
    unidadeIds: input.unidadeId ? [input.unidadeId] : undefined,
  });
  return JSON.stringify(visaoGeral);
}

export async function handleRankingUnidades(input: { dataInicio?: string; dataFim?: string }) {
  const ranking = await relatorios.rankingUnidades(filtroPeriodo(input.dataInicio, input.dataFim));
  return JSON.stringify(ranking);
}

export async function handleRelatorioEmprestimos(input: { dataInicio?: string; dataFim?: string; unidadeId?: string }) {
  const relatorio = await relatorios.emprestimos({
    ...filtroPeriodo(input.dataInicio, input.dataFim),
    unidadeIds: input.unidadeId ? [input.unidadeId] : undefined,
  });
  return JSON.stringify(relatorio);
}

const descricaoPeriodo = 'Formato AAAA-MM-DD. Omita para não filtrar por período.';

export const assistenteTools = [
  betaZodTool({
    name: 'itens_aguardando_estoque',
    description:
      'Lista os tipos de equipamento que estão represados aguardando estoque suficiente pra reservar (Ampliação/Substituição), com a quantidade pendente, quantas solicitações e o valor previsto de cada um.',
    inputSchema: z.object({}),
    run: handleItensAguardandoEstoque,
  }),
  betaZodTool({
    name: 'resumo_item',
    description:
      'Resumo de um tipo de equipamento: quantas solicitações foram entregues (concluídas), quantas estão pendentes e qual a demanda represada aguardando estoque. Sem tipoEquipamentoId, agrega todos os itens. Se não souber o ID do item, use buscar_tipo_equipamento antes.',
    inputSchema: z.object({
      tipoEquipamentoId: z.string().uuid().optional().describe('ID do tipo de equipamento — omita para o resumo agregado de todos os itens'),
      dataInicio: z.string().optional().describe(descricaoPeriodo),
      dataFim: z.string().optional().describe(descricaoPeriodo),
    }),
    run: handleResumoItem,
  }),
  betaZodTool({
    name: 'buscar_tipo_equipamento',
    description: 'Busca tipos de equipamento pelo nome (ex.: "purificador de água") pra descobrir o ID a usar em outras ferramentas.',
    inputSchema: z.object({ nome: z.string().min(1).describe('Termo de busca — parte do nome do item') }),
    run: handleBuscarTipoEquipamento,
  }),
  betaZodTool({
    name: 'visao_geral_solicitacoes',
    description:
      'Funil de solicitações por tipo (Substituição, Ampliação, Cessão de Uso, Empréstimo, Recolha), contando quantas estão em andamento, concluídas ou negadas/canceladas.',
    inputSchema: z.object({
      dataInicio: z.string().optional().describe(descricaoPeriodo),
      dataFim: z.string().optional().describe(descricaoPeriodo),
      unidadeId: z.string().uuid().optional().describe('Filtra só as solicitações abertas por essa unidade'),
    }),
    run: handleVisaoGeralSolicitacoes,
  }),
  betaZodTool({
    name: 'ranking_unidades',
    description:
      'Ranking das unidades que mais abriram solicitações de Substituição, Ampliação, Empréstimo ou Recolha, com o total por tipo e a unidade com mais volume no topo.',
    inputSchema: z.object({
      dataInicio: z.string().optional().describe(descricaoPeriodo),
      dataFim: z.string().optional().describe(descricaoPeriodo),
    }),
    run: handleRankingUnidades,
  }),
  betaZodTool({
    name: 'relatorio_emprestimos',
    description:
      'Lista de empréstimos entre unidades, com o percentual de devoluções em atraso, a duração média do processo e o detalhe de cada empréstimo (equipamento, origem, destino, prazo, status).',
    inputSchema: z.object({
      dataInicio: z.string().optional().describe(descricaoPeriodo),
      dataFim: z.string().optional().describe(descricaoPeriodo),
      unidadeId: z.string().uuid().optional().describe('Filtra só os empréstimos da unidade de origem'),
    }),
    run: handleRelatorioEmprestimos,
  }),
];
