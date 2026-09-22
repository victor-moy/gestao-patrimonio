import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Relatórios — Fase 1 (visão geral, ranking, empréstimos, cessões)', () => {
  it('bloqueia o Gestor de Manutenção — relatórios de Solicitações são exclusivos do Gestor de Patrimônio', async () => {
    const res = await request(app).get('/relatorios/visao-geral').set(auth('GESTOR_MANUTENCAO'));
    expect(res.status).toBe(403);
  });

  it('visão geral: agrupa em andamento / concluída / negada-cancelada por tipo', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { tipo: 'EMPRESTIMO', status: 'AGUARDANDO_RETORNO', _count: { id: 3 } },
      { tipo: 'EMPRESTIMO', status: 'CONCLUIDA', _count: { id: 10 } },
      { tipo: 'EMPRESTIMO', status: 'NEGADA', _count: { id: 1 } },
      { tipo: 'CESSAO_USO', status: 'RESERVADO', _count: { id: 2 } },
    ]);
    const res = await request(app).get('/relatorios/visao-geral').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    const emprestimo = res.body.find((r: { tipo: string }) => r.tipo === 'EMPRESTIMO');
    expect(emprestimo).toEqual({ tipo: 'EMPRESTIMO', emAndamento: 3, concluida: 10, negadaCancelada: 1 });
    const cessao = res.body.find((r: { tipo: string }) => r.tipo === 'CESSAO_USO');
    expect(cessao).toEqual({ tipo: 'CESSAO_USO', emAndamento: 2, concluida: 0, negadaCancelada: 0 });
    // Todos os 5 tipos aparecem, mesmo sem dados (zerados)
    expect(res.body).toHaveLength(5);
    expect(res.body.find((r: { tipo: string }) => r.tipo === 'RECOLHA')).toEqual({
      tipo: 'RECOLHA',
      emAndamento: 0,
      concluida: 0,
      negadaCancelada: 0,
    });
  });

  it('ranking de unidades: conta por tipo, os 4 tipos lado a lado por unidade, ordenado pelo total desc', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { unidadeOrigemId: 'unidade-1', tipo: 'SUBSTITUICAO', _count: { id: 12 } },
      { unidadeOrigemId: 'unidade-1', tipo: 'EMPRESTIMO', _count: { id: 2 } },
      { unidadeOrigemId: 'unidade-2', tipo: 'AMPLIACAO', _count: { id: 20 } },
    ]);
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'unidade-1', nome: 'UBS Sul' },
      { id: 'unidade-2', nome: 'UBS Centro' },
    ] as never);
    const res = await request(app).get('/relatorios/ranking-unidades').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    // UBS Centro vem primeiro: total 20 > 14 da UBS Sul
    expect(res.body).toEqual([
      { unidadeId: 'unidade-2', unidade: 'UBS Centro', SUBSTITUICAO: 0, AMPLIACAO: 20, EMPRESTIMO: 0, RECOLHA: 0 },
      { unidadeId: 'unidade-1', unidade: 'UBS Sul', SUBSTITUICAO: 12, AMPLIACAO: 0, EMPRESTIMO: 2, RECOLHA: 0 },
    ]);
    // Cessão de Uso fica de fora — sua unidade de origem é o galpão, não uma
    // unidade solicitando
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: { in: ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'] },
        }),
      }),
    );
  });

  it('empréstimos: sinaliza atraso de quem está aguardando retorno além do prazo', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 'sol-1',
        status: 'AGUARDANDO_RETORNO',
        dataRetornoPrevista: new Date('2020-01-01'),
        criadoEm: new Date('2019-12-01'),
        atualizadoEm: new Date('2020-02-01'),
        equipamento: { tombamento: '123', descricao: 'Autoclave' },
        unidadeOrigem: { nome: 'UBS Sul' },
        unidadeDestino: { nome: 'UBS Centro' },
      },
    ] as never);
    const res = await request(app).get('/relatorios/emprestimos').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.itens[0].atrasado).toBe(true);
    expect(res.body.percentualAtraso).toBe(100);
  });

  it('empréstimos: calcula a duração média dos concluídos, em dias', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 'sol-1',
        status: 'CONCLUIDA',
        dataRetornoPrevista: new Date('2026-01-10'),
        criadoEm: new Date('2026-01-01T00:00:00Z'),
        atualizadoEm: new Date('2026-01-11T00:00:00Z'),
        equipamento: { tombamento: '123', descricao: 'Autoclave' },
        unidadeOrigem: { nome: 'UBS Sul' },
        unidadeDestino: { nome: 'UBS Centro' },
      },
    ] as never);
    const res = await request(app).get('/relatorios/emprestimos').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.duracaoMediaDias).toBe(10);
    // Devolvido 1 dia depois do prazo previsto (10/01) — conta como atraso
    expect(res.body.itens[0].atrasado).toBe(true);
  });

  it('cessões: lista com entidade externa, tipo de equipamento e nº de patrimônio', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 'sol-1',
        entidadeExternaNome: 'Hospital Regional',
        tipoEquipamento: { nome: 'Autoclave Vertical 75L' },
        numerosPatrimonio: ['12345/2026'],
        unidadeOrigem: { nome: 'Galpão CIAD/Branet' },
        status: 'CONCLUIDA',
        numeroPedidoBranet: 'PED-1',
        pedidoEntregaRegistradoEm: new Date('2026-01-05'),
        criadoEm: new Date('2026-01-01'),
      },
    ] as never);
    const res = await request(app).get('/relatorios/cessoes').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.itens[0]).toMatchObject({
      entidadeExternaNome: 'Hospital Regional',
      tipoEquipamento: 'Autoclave Vertical 75L',
      numerosPatrimonio: ['12345/2026'],
      unidadeOrigem: 'Galpão CIAD/Branet',
      numeroPedidoBranet: 'PED-1',
    });
  });

  it('filtra por período e por múltiplas unidades (multiselect) em todos os relatórios', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([]);
    const UUID_2 = '5fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b7';
    const res = await request(app)
      .get(`/relatorios/visao-geral?dataInicio=2026-01-01&dataFim=2026-01-31&unidadeId=${UUID},${UUID_2}`)
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unidadeOrigemId: { in: [UUID, UUID_2] },
          criadoEm: expect.objectContaining({ gte: new Date('2026-01-01'), lte: new Date('2026-01-31') }),
        }),
      }),
    );
  });

  it('itens e estoque: lista o que está aguardando disponibilidade, agregado por tipo', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { tipoEquipamentoId: UUID, _sum: { quantidade: 7 }, _count: { _all: 2 } },
    ]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: UUID, nome: 'Autoclave Vertical 75L', codigo: 'AUT-75', categoria: { nome: 'Esterilização', cor: '#000' } },
    ] as never);
    const res = await request(app).get('/relatorios/itens-estoque').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ quantidade: 7, solicitacoes: 2 })]);
    expect(res.body[0].tipoEquipamento.nome).toBe('Autoclave Vertical 75L');
  });

  it('itens por unidade: acumula CADASTRO/RECEBIMENTO_GALPAO/RECOLHA/BAIXA mês a mês, sem contar empréstimo/manutenção', async () => {
    prismaMock.movimentacao.findMany.mockResolvedValue([
      { unidadeOrigemId: null, unidadeDestinoId: 'unidade-1', criadoEm: new Date('2026-01-10') },
      { unidadeOrigemId: null, unidadeDestinoId: 'unidade-1', criadoEm: new Date('2026-02-05') },
      { unidadeOrigemId: 'unidade-1', unidadeDestinoId: 'unidade-2', criadoEm: new Date('2026-02-20') },
      { unidadeOrigemId: 'unidade-2', unidadeDestinoId: null, criadoEm: new Date('2026-03-01') },
    ] as never);
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'unidade-1', nome: 'UBS Sul' },
      { id: 'unidade-2', nome: 'Galpão CIAD/Branet' },
    ] as never);
    const res = await request(app)
      .get('/relatorios/itens-por-unidade?dataFim=2026-03-31')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.unidades).toEqual(['UBS Sul', 'Galpão CIAD/Branet']);
    expect(res.body.linhas).toEqual([
      { mes: '2026-01', 'UBS Sul': 1, 'Galpão CIAD/Branet': 0 },
      { mes: '2026-02', 'UBS Sul': 1, 'Galpão CIAD/Branet': 1 },
      { mes: '2026-03', 'UBS Sul': 1, 'Galpão CIAD/Branet': 0 },
    ]);
    expect(prismaMock.movimentacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipo: { in: ['CADASTRO', 'IMPORTACAO_CSV', 'RECEBIMENTO_GALPAO', 'RECOLHA', 'BAIXA'] } },
      }),
    );
  });

  it('itens por unidade: filtro de unidade restringe as séries retornadas', async () => {
    prismaMock.movimentacao.findMany.mockResolvedValue([
      { unidadeOrigemId: null, unidadeDestinoId: 'unidade-1', criadoEm: new Date('2026-01-10') },
      { unidadeOrigemId: null, unidadeDestinoId: 'unidade-2', criadoEm: new Date('2026-01-15') },
    ] as never);
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'unidade-1', nome: 'UBS Sul' },
      { id: 'unidade-2', nome: 'UBS Norte' },
    ] as never);
    const res = await request(app)
      .get('/relatorios/itens-por-unidade?dataFim=2026-01-31&unidadeId=unidade-1')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.unidades).toEqual(['UBS Sul']);
    expect(res.body.linhas).toEqual([{ mes: '2026-01', 'UBS Sul': 1 }]);
  });
});
