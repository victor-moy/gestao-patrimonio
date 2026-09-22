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

  it('ranking de unidades exige o tipo de solicitação', async () => {
    const res = await request(app).get('/relatorios/ranking-unidades').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
  });

  it('ranking de unidades: conta solicitações por unidade de origem, filtrado por tipo', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { unidadeOrigemId: 'unidade-1', _count: { id: 12 } },
      { unidadeOrigemId: 'unidade-2', _count: { id: 5 } },
    ]);
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'unidade-1', nome: 'UBS Sul' },
      { id: 'unidade-2', nome: 'UBS Centro' },
    ] as never);
    const res = await request(app)
      .get('/relatorios/ranking-unidades?tipo=SUBSTITUICAO')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { unidadeId: 'unidade-1', unidade: 'UBS Sul', quantidade: 12 },
      { unidadeId: 'unidade-2', unidade: 'UBS Centro', quantidade: 5 },
    ]);
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tipo: 'SUBSTITUICAO' }) }),
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

  it('filtra por período em todos os relatórios', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([]);
    const res = await request(app)
      .get(`/relatorios/visao-geral?dataInicio=2026-01-01&dataFim=2026-01-31&unidadeId=${UUID}`)
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          unidadeOrigemId: UUID,
          criadoEm: expect.objectContaining({ gte: new Date('2026-01-01'), lte: new Date('2026-01-31') }),
        }),
      }),
    );
  });
});
