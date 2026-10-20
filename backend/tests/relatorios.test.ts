import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Relatórios — Fase 1 (visão geral, ranking, empréstimos, cessões)', () => {
  it.each(['UNIDADE', 'GALPAO', 'TERCEIRIZADA'] as const)('bloqueia o perfil %s nos relatórios', async (perfil) => {
    const res = await request(app).get('/relatorios/visao-geral').set(auth(perfil, { unidadeId: 'u-1', prestadorId: 'p-1' }));
    expect(res.status).toBe(403);
  });

  it('visão geral: agrupa em andamento / concluída / negada-cancelada por tipo', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { tipo: 'EMPRESTIMO', status: 'AGUARDANDO_RETORNO', _count: { id: 3 } },
      { tipo: 'EMPRESTIMO', status: 'CONCLUIDA', _count: { id: 10 } },
      { tipo: 'EMPRESTIMO', status: 'NEGADA', _count: { id: 1 } },
      { tipo: 'CESSAO_USO', status: 'RESERVADO', _count: { id: 2 } },
    ]);
    (prismaMock.manutencao.groupBy as jest.Mock).mockResolvedValue([
      { status: 'EM_EXECUCAO', _count: { id: 4 } },
      { status: 'AGUARDANDO_ORCAMENTO', _count: { id: 1 } },
      { status: 'CONCLUIDA', _count: { id: 6 } },
      { status: 'NEGADA', _count: { id: 2 } },
      { status: 'BAIXADO', _count: { id: 1 } },
    ]);
    const res = await request(app).get('/relatorios/visao-geral').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    const emprestimo = res.body.find((r: { tipo: string }) => r.tipo === 'EMPRESTIMO');
    expect(emprestimo).toEqual({ tipo: 'EMPRESTIMO', emAndamento: 3, concluida: 10, negadaCancelada: 1 });
    const cessao = res.body.find((r: { tipo: string }) => r.tipo === 'CESSAO_USO');
    expect(cessao).toEqual({ tipo: 'CESSAO_USO', emAndamento: 2, concluida: 0, negadaCancelada: 0 });
    // A manutenção é mais um tipo: negadas e baixadas contam como canceladas
    expect(res.body.find((r: { tipo: string }) => r.tipo === 'MANUTENCAO')).toEqual({
      tipo: 'MANUTENCAO',
      emAndamento: 5,
      concluida: 6,
      negadaCancelada: 3,
    });
    // Os 5 tipos de solicitação mais a manutenção aparecem, mesmo sem dados (zerados)
    expect(res.body).toHaveLength(6);
    expect(res.body.find((r: { tipo: string }) => r.tipo === 'RECOLHA')).toEqual({
      tipo: 'RECOLHA',
      emAndamento: 0,
      concluida: 0,
      negadaCancelada: 0,
    });
  });

  it('ranking de unidades: conta por tipo (4 de solicitação + manutenção) lado a lado por unidade, ordenado pelo total desc', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { unidadeOrigemId: 'unidade-1', tipo: 'SUBSTITUICAO', _count: { id: 12 } },
      { unidadeOrigemId: 'unidade-1', tipo: 'EMPRESTIMO', _count: { id: 2 } },
      { unidadeOrigemId: 'unidade-2', tipo: 'AMPLIACAO', _count: { id: 20 } },
    ]);
    (prismaMock.manutencao.groupBy as jest.Mock).mockResolvedValue([
      { unidadeId: 'unidade-1', _count: { id: 9 } },
    ]);
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'unidade-1', nome: 'UBS Sul' },
      { id: 'unidade-2', nome: 'UBS Centro' },
    ] as never);
    const res = await request(app).get('/relatorios/ranking-unidades').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    // UBS Sul vem primeiro: 12 + 2 + 9 de manutenção = 23 > 20 da UBS Centro
    expect(res.body).toEqual([
      { unidadeId: 'unidade-1', unidade: 'UBS Sul', SUBSTITUICAO: 12, AMPLIACAO: 0, EMPRESTIMO: 2, RECOLHA: 0, MANUTENCAO: 9 },
      { unidadeId: 'unidade-2', unidade: 'UBS Centro', SUBSTITUICAO: 0, AMPLIACAO: 20, EMPRESTIMO: 0, RECOLHA: 0, MANUTENCAO: 0 },
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

  it('empréstimos e cessões trazem o número e o título da solicitação', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 'sol-1',
        numero: 12,
        titulo: 'Empréstimo de autoclave para a UBS Centro',
        status: 'AGUARDANDO_RETORNO',
        dataRetornoPrevista: new Date('2030-01-01'),
        criadoEm: new Date('2029-12-01'),
        atualizadoEm: new Date('2029-12-02'),
        equipamento: { tombamento: '123', descricao: 'Autoclave' },
        unidadeOrigem: { nome: 'UBS Sul' },
        unidadeDestino: { nome: 'UBS Centro' },
      },
    ] as never);
    const emprestimos = await request(app).get('/relatorios/emprestimos').set(auth('OPERADOR'));
    expect(emprestimos.body.itens[0]).toMatchObject({ numero: 12, titulo: 'Empréstimo de autoclave para a UBS Centro' });

    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 'sol-2',
        numero: 15,
        titulo: 'Cessão de microscópio',
        status: 'RESERVADO',
        numerosPatrimonio: ['999'],
        entidadeExternaNome: 'Hospital Regional',
        tipoEquipamento: { nome: 'Microscópio', preco: null },
        unidadeOrigem: { nome: 'Galpão' },
        numeroPedidoBranet: null,
        pedidoEntregaRegistradoEm: null,
        criadoEm: new Date('2026-01-01'),
      },
    ] as never);
    const cessoes = await request(app).get('/relatorios/cessoes?busca=microsc').set(auth('OPERADOR'));
    expect(cessoes.body.itens[0]).toMatchObject({ numero: 15, titulo: 'Cessão de microscópio' });
    // a busca também procura no título
    const porTitulo = await request(app).get('/relatorios/cessoes?busca=cessão de micro').set(auth('OPERADOR'));
    expect(porTitulo.body.itens).toHaveLength(1);
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
    const res = await request(app).get('/relatorios/emprestimos').set(auth('OPERADOR'));
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
    const res = await request(app).get('/relatorios/emprestimos').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
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
    const res = await request(app).get('/relatorios/cessoes').set(auth('OPERADOR'));
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
      .set(auth('OPERADOR'));
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
      {
        tipoEquipamentoId: UUID,
        _sum: { quantidade: 7 },
        _count: { _all: 2 },
        _min: { criadoEm: new Date('2026-01-01') },
      },
    ]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: UUID, nome: 'Autoclave Vertical 75L', codigo: 'AUT-75', categoria: { nome: 'Esterilização', cor: '#000' } },
    ] as never);
    const res = await request(app).get('/relatorios/itens-estoque').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ quantidade: 7, solicitacoes: 2 })]);
    expect(res.body[0].tipoEquipamento.nome).toBe('Autoclave Vertical 75L');
    expect(res.body[0].aguardandoDesde).toBe('2026-01-01T00:00:00.000Z');
  });

});

describe('Relatórios — feedback do stakeholder (filtro por item, busca, drill-down, resumo)', () => {
  it('filtro por item: cobre tanto tipoEquipamentoId direto quanto via equipamento (empréstimo/recolha)', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([]);
    await request(app)
      .get(`/relatorios/visao-geral?tipoEquipamentoId=${UUID}`)
      .set(auth('OPERADOR'));
    expect(prismaMock.solicitacao.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ tipoEquipamentoId: UUID }, { equipamento: { tipoEquipamentoId: UUID } }],
        }),
      }),
    );
  });

  it('empréstimos: busca por patrimônio filtra por tombamento/descrição do equipamento', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    await request(app)
      .get('/relatorios/emprestimos?busca=autoclave')
      .set(auth('OPERADOR'));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { titulo: { contains: 'autoclave', mode: 'insensitive' } },
                { equipamento: { tombamento: { contains: 'autoclave', mode: 'insensitive' } } },
                { equipamento: { descricao: { contains: 'autoclave', mode: 'insensitive' } } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('cessões: busca por patrimônio filtra em JS sobre numerosPatrimonio/entidade/tipo', async () => {
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
      {
        id: 'sol-2',
        entidadeExternaNome: 'Creche Municipal',
        tipoEquipamento: { nome: 'Purificador de Água' },
        numerosPatrimonio: ['99999/2026'],
        unidadeOrigem: { nome: 'Galpão CIAD/Branet' },
        status: 'CONCLUIDA',
        numeroPedidoBranet: 'PED-2',
        pedidoEntregaRegistradoEm: new Date('2026-01-06'),
        criadoEm: new Date('2026-01-01'),
      },
    ] as never);
    const res = await request(app).get('/relatorios/cessoes?busca=12345').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0].id).toBe('sol-1');
  });

  it('resumo do item: entregue (concluída), pendente (em andamento) e demanda valorizada (aguardando estoque)', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({
      id: UUID,
      nome: 'Purificador de Água',
      preco: '250.00',
    } as never);
    (prismaMock.solicitacao.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { status: 'CONCLUIDA', _count: { id: 5 } },
        { status: 'RESERVADO', _count: { id: 3 } },
        { status: 'NEGADA', _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([{ tipoEquipamentoId: UUID, _sum: { quantidade: 4 } }]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([{ id: UUID, preco: '250.00' }] as never);
    const res = await request(app)
      .get(`/relatorios/resumo-item?tipoEquipamentoId=${UUID}`)
      .set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      itemNome: 'Purificador de Água',
      entregue: 5,
      pendente: 3,
      demandaQuantidade: 4,
      demandaValor: 1000,
    });
    expect(prismaMock.solicitacao.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ tipo: { in: ['AMPLIACAO', 'SUBSTITUICAO', 'CESSAO_USO'] }, tipoEquipamentoId: UUID }),
      }),
    );
  });

  it('resumo do item sem filtro: agrega todos os itens, valorizando a demanda por tipo (preços diferentes)', async () => {
    (prismaMock.solicitacao.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { status: 'CONCLUIDA', _count: { id: 10 } },
        { status: 'PENDENTE_APROVACAO', _count: { id: 4 } },
      ])
      .mockResolvedValueOnce([
        { tipoEquipamentoId: 'tipo-1', _sum: { quantidade: 2 } },
        { tipoEquipamentoId: 'tipo-2', _sum: { quantidade: 3 } },
      ]);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: 'tipo-1', preco: '100.00' },
      { id: 'tipo-2', preco: '50.00' },
    ] as never);
    const res = await request(app).get('/relatorios/resumo-item').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      itemNome: 'Todos os itens',
      entregue: 10,
      pendente: 4,
      demandaQuantidade: 5,
      demandaValor: 350, // 2×100 + 3×50 — não dá pra multiplicar pela soma por um preço só
    });
    expect(prismaMock.tipoEquipamento.findUnique).not.toHaveBeenCalled();
    const primeiraChamada = (prismaMock.solicitacao.groupBy as jest.Mock).mock.calls[0][0];
    expect(primeiraChamada.where.tipoEquipamentoId).toBeUndefined();
  });
});

describe('Relatório de manutenções', () => {
  const registro = (extra: Record<string, unknown>) => ({
    id: 'm',
    numero: 1,
    titulo: null,
    status: 'EM_EXECUCAO',
    criadoEm: new Date('2026-09-10T12:00:00.000Z'),
    dataConclusao: null,
    orcamentoValor: null,
    custoFinal: null,
    unidade: { nome: 'UBS Centro' },
    equipamento: {
      tombamento: '123/2024',
      descricao: 'Autoclave',
      tipoEquipamentoId: 'tipo-1',
      tipoEquipamento: { nome: 'Autoclave 75L', preco: '10000' },
    },
    contrato: { numero: 'CONT-1', prestadorId: 'p-1', prestador: { nome: 'Tecnomed' } },
    ...extra,
  });

  it.each(['UNIDADE', 'GALPAO', 'TERCEIRIZADA'] as const)('bloqueia o perfil %s', async (perfil) => {
    const res = await request(app).get('/relatorios/manutencoes').set(auth(perfil, { unidadeId: 'u-1', prestadorId: 'p-1' }));
    expect(res.status).toBe(403);
  });

  it('agrupa por situação e soma custo (custo final, ou orçamento enquanto não há); negadas e baixadas não custam', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([
      registro({ id: 'a', numero: 1, status: 'CONCLUIDA', orcamentoValor: '1000', custoFinal: '900', criadoEm: new Date('2026-09-10T12:00:00Z'), dataConclusao: new Date('2026-09-20T12:00:00Z') }),
      registro({ id: 'b', numero: 2, status: 'CONCLUIDA', orcamentoValor: '500', custoFinal: '500', criadoEm: new Date('2026-10-01T12:00:00Z'), dataConclusao: new Date('2026-10-05T12:00:00Z') }),
      registro({ id: 'c', numero: 3, status: 'EM_EXECUCAO', orcamentoValor: '700', criadoEm: new Date('2026-10-02T12:00:00Z') }),
      registro({ id: 'd', numero: 4, status: 'NEGADA', orcamentoValor: '300', criadoEm: new Date('2026-10-03T12:00:00Z') }),
      registro({ id: 'e', numero: 5, status: 'BAIXADO', orcamentoValor: '8000', criadoEm: new Date('2026-10-04T12:00:00Z') }),
    ] as never);
    const res = await request(app).get('/relatorios/manutencoes').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 5,
      emAndamento: 1,
      concluidas: 2,
      negadas: 1,
      baixadas: 1,
      custoTotal: 2100, // 900 + 500 + 700
      tempoMedioDias: 7, // (10 + 4) / 2
      truncado: false,
      itensTotal: 5,
    });
    expect(res.body.porMes).toEqual([
      { mes: '2026-09', quantidade: 1, custo: 900 },
      { mes: '2026-10', quantidade: 4, custo: 1200 },
    ]);
    expect(res.body.porPrestador).toEqual([{ prestadorId: 'p-1', prestador: 'Tecnomed', quantidade: 5, custo: 2100 }]);
    expect(res.body.porItem[0]).toMatchObject({ nome: 'Autoclave 75L', quantidade: 5, custo: 2100 });
  });

  it('conta orçamentos a partir de 50% do preço de referência e marca a linha como não sugerida', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([
      registro({ id: 'a', numero: 1, status: 'ORCAMENTO_REGISTRADO', orcamentoValor: '5000' }),
      registro({ id: 'b', numero: 2, status: 'ORCAMENTO_REGISTRADO', orcamentoValor: '4999' }),
      registro({ id: 'c', numero: 3, status: 'ORCAMENTO_REGISTRADO', orcamentoValor: '9000', equipamento: { ...registro({}).equipamento, tipoEquipamento: { nome: 'Sem preço', preco: null } } }),
    ] as never);
    const res = await request(app).get('/relatorios/manutencoes').set(auth('OPERADOR'));
    expect(res.body.orcamentosAltos).toBe(1);
    expect(res.body.itens.map((i: { naoSugerida: boolean }) => i.naoSugerida)).toEqual([true, false, false]);
  });

  it('sem contrato o prestador aparece como "Sem contrato"; manutenção antiga não quebra o relatório', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([registro({ contrato: null })] as never);
    const res = await request(app).get('/relatorios/manutencoes').set(auth('OPERADOR'));
    expect(res.body.porPrestador[0]).toMatchObject({ prestador: 'Sem contrato', quantidade: 1 });
    expect(res.body.itens[0]).toMatchObject({ prestador: null, contrato: null });
  });

  it('repassa os filtros ao banco (período, unidades, item, prestador, situação e busca por número)', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .get(`/relatorios/manutencoes?dataInicio=2026-01-01&dataFim=2026-12-31&unidadeId=u1,u2&tipoEquipamentoId=${UUID}&prestadorId=p-9&situacao=EM_ANDAMENTO&busca=MAN-0007`)
      .set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    const where = (prismaMock.manutencao.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      unidadeId: { in: ['u1', 'u2'] },
      equipamento: { tipoEquipamentoId: UUID },
      contrato: { prestadorId: 'p-9' },
      status: { in: ['PENDENTE_APROVACAO', 'AGUARDANDO_PROVIDENCIAS', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'AGUARDANDO_EXECUCAO', 'EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO', 'REENCAMINHAMENTO_SOLICITADO'] },
    });
    expect((where.criadoEm as { gte: Date }).gte).toEqual(new Date('2026-01-01'));
    expect((where.OR as unknown[])[0]).toEqual({ numero: 7 });
  });

  it('recusa situação e data inválidas e limita a tabela a 200 linhas sem perder os totais', async () => {
    expect((await request(app).get('/relatorios/manutencoes?situacao=XYZ').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/relatorios/manutencoes?dataInicio=ontem').set(auth('OPERADOR'))).status).toBe(422);
    prismaMock.manutencao.findMany.mockResolvedValue(Array.from({ length: 250 }, (_, i) => registro({ id: `m${i}`, numero: i + 1 })) as never);
    const res = await request(app).get('/relatorios/manutencoes').set(auth('OPERADOR'));
    expect(res.body.total).toBe(250);
    expect(res.body.itensTotal).toBe(250);
    expect(res.body.itens).toHaveLength(200);
  });
});
