import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { auth } from './helpers';

jest.mock('@anthropic-ai/sdk', () => {
  const toolRunner = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Resposta simulada da IA.' }],
  });
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      beta: { messages: { toolRunner } },
    })),
    __toolRunnerMock: toolRunner,
  };
});

import { criarApp } from '../src/app';
import { env } from '../src/config/env';
import { limparMarkdown } from '../src/modules/assistente/assistente.service';
import {
  handleBuscarTipoEquipamento,
  handleItensAguardandoEstoque,
  handleRankingUnidades,
  handleRelatorioEmprestimos,
  handleResumoItem,
  handleVisaoGeralSolicitacoes,
} from '../src/modules/assistente/assistente.tools';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Assistente de IA — tools (wrappers em cima dos relatórios)', () => {
  it('itens_aguardando_estoque: devolve o JSON de itensEstoque()', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { tipoEquipamentoId: UUID, _sum: { quantidade: 7 }, _count: { _all: 2 } },
    ]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: UUID, nome: 'Purificador de Água', codigo: 'PUR-1', categoria: { nome: 'Cozinha', cor: '#000' } },
    ] as never);
    const resultado = JSON.parse(await handleItensAguardandoEstoque());
    expect(resultado).toEqual([expect.objectContaining({ quantidade: 7, solicitacoes: 2 })]);
    expect(resultado[0].tipoEquipamento.nome).toBe('Purificador de Água');
  });

  it('resumo_item: repassa tipoEquipamentoId e período pro resumoItem()', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({ id: UUID, nome: 'Purificador de Água', preco: '250.00' } as never);
    (prismaMock.solicitacao.groupBy as jest.Mock)
      .mockResolvedValueOnce([{ status: 'CONCLUIDA', _count: { id: 5 } }])
      .mockResolvedValueOnce([]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([]);
    const resultado = JSON.parse(
      await handleResumoItem({ tipoEquipamentoId: UUID, dataInicio: '2026-01-01', dataFim: '2026-01-31' }),
    );
    expect(resultado).toEqual({ itemNome: 'Purificador de Água', entregue: 5, pendente: 0, demandaQuantidade: 0, demandaValor: 0 });
    expect(prismaMock.solicitacao.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          tipoEquipamentoId: UUID,
          criadoEm: expect.objectContaining({ gte: new Date('2026-01-01'), lte: new Date('2026-01-31') }),
        }),
      }),
    );
  });

  it('buscar_tipo_equipamento: busca por nome, case-insensitive', async () => {
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: UUID, nome: 'Purificador de Água', codigo: 'PUR-1' },
    ] as never);
    const resultado = JSON.parse(await handleBuscarTipoEquipamento({ nome: 'purificador' }));
    expect(resultado).toEqual([{ id: UUID, nome: 'Purificador de Água', codigo: 'PUR-1' }]);
    expect(prismaMock.tipoEquipamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nome: { contains: 'purificador', mode: 'insensitive' } },
      }),
    );
  });

  it('visao_geral_solicitacoes: converte unidadeId único em unidadeIds', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([]);
    await handleVisaoGeralSolicitacoes({ unidadeId: 'unidade-1' });
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unidadeOrigemId: { in: ['unidade-1'] } }) }),
    );
  });

  it('ranking_unidades: devolve o JSON de rankingUnidades()', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { unidadeOrigemId: 'unidade-1', tipo: 'AMPLIACAO', _count: { id: 3 } },
    ]);
    prismaMock.unidade.findMany.mockResolvedValue([{ id: 'unidade-1', nome: 'UBS Sul' }] as never);
    const resultado = JSON.parse(await handleRankingUnidades({}));
    expect(resultado).toEqual([
      { unidadeId: 'unidade-1', unidade: 'UBS Sul', SUBSTITUICAO: 0, AMPLIACAO: 3, EMPRESTIMO: 0, RECOLHA: 0 },
    ]);
  });

  it('relatorio_emprestimos: converte unidadeId único em unidadeIds', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    await handleRelatorioEmprestimos({ unidadeId: 'unidade-1' });
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unidadeOrigemId: { in: ['unidade-1'] } }) }),
    );
  });
});

describe('Assistente de IA — limparMarkdown', () => {
  it('remove negrito com asteriscos duplos', () => {
    expect(limparMarkdown('O item é **Purificador de Água** com 3 unidades.')).toBe(
      'O item é Purificador de Água com 3 unidades.',
    );
  });

  it('remove ênfase com asterisco simples, sem afetar um asterisco solto', () => {
    expect(limparMarkdown('Isso é *importante* e aqui um * solto.')).toBe('Isso é importante e aqui um * solto.');
  });

  it('remove cabeçalhos markdown no início da linha', () => {
    expect(limparMarkdown('# Resumo\nTexto normal')).toBe('Resumo\nTexto normal');
  });

  it('deixa texto sem marcação intacto', () => {
    expect(limparMarkdown('Nenhum empréstimo em atraso no momento.')).toBe('Nenhum empréstimo em atraso no momento.');
  });
});

describe('Assistente de IA — POST /assistente/perguntar', () => {
  afterEach(() => {
    env.anthropicApiKey = '';
  });

  it('bloqueia quem não é Gestor de Patrimônio', async () => {
    const res = await request(app)
      .post('/assistente/perguntar')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({ mensagens: [{ role: 'user', content: 'Olá' }] });
    expect(res.status).toBe(403);
  });

  it('exige ao menos uma mensagem no corpo', async () => {
    env.anthropicApiKey = 'chave-de-teste';
    const res = await request(app).post('/assistente/perguntar').set(auth('GESTOR_PATRIMONIO')).send({ mensagens: [] });
    expect(res.status).toBe(422);
  });

  it('sem ANTHROPIC_API_KEY configurada, devolve 503', async () => {
    const res = await request(app)
      .post('/assistente/perguntar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ mensagens: [{ role: 'user', content: 'Qual item tem mais demanda?' }] });
    expect(res.status).toBe(503);
  });

  it('com a chave configurada, chama o tool runner e devolve o texto da resposta', async () => {
    env.anthropicApiKey = 'chave-de-teste';
    const res = await request(app)
      .post('/assistente/perguntar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ mensagens: [{ role: 'user', content: 'Qual item tem maior quantidade aguardando estoque?' }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resposta: 'Resposta simulada da IA.' });
  });
});
