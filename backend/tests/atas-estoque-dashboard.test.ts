import request from 'supertest';
import { Prisma } from '@prisma/client';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

describe('Atas (UC19/UC20, RF33-RF35)', () => {
  it('cadastra ata com saldo igual ao valor total por padrão', async () => {
    prismaMock.ata.findUnique.mockResolvedValue(null);
    prismaMock.ata.create.mockResolvedValue({
      id: 'ata-1',
      numero: '067/2026',
      saldo: new Prisma.Decimal(50000),
    } as never);
    const res = await request(app)
      .post('/atas')
      .set(auth('OPERADOR'))
      .send({
        numero: '067/2026',
        fornecedor: 'OdontoMed Equipamentos',
        descricao: 'Ata de equipamentos odontológicos',
        valorTotal: 50000,
        vencimento: '2027-06-30',
      });
    expect(res.status).toBe(201);
    expect(prismaMock.ata.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ saldo: 50000 }) }),
    );
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita número de ata duplicado', async () => {
    prismaMock.ata.findUnique.mockResolvedValue({ id: 'ata-1' } as never);
    const res = await request(app)
      .post('/atas')
      .set(auth('OPERADOR'))
      .send({
        numero: '067/2026',
        fornecedor: 'OdontoMed Equipamentos',
        descricao: 'Duplicada',
        valorTotal: 50000,
        vencimento: '2027-06-30',
      });
    expect(res.status).toBe(409);
  });

  it('gera alertas de vencimento em 30 dias e saldo < 10% (RF35)', async () => {
    prismaMock.ata.findMany.mockResolvedValue([
      {
        id: 'ata-1',
        numero: '052/2024',
        valorTotal: new Prisma.Decimal(320000),
        saldo: new Prisma.Decimal(12500),
        vencimento: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        ativo: true,
      },
      {
        id: 'ata-2',
        numero: '045/2025',
        valorTotal: new Prisma.Decimal(250000),
        saldo: new Prisma.Decimal(180000),
        vencimento: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
        ativo: true,
      },
    ] as never);
    const res = await request(app).get('/atas/alertas').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    const tipos = res.body.map((a: { tipo: string }) => a.tipo);
    expect(tipos).toContain('VENCIMENTO');
    expect(tipos).toContain('SALDO_BAIXO');
    expect(res.body.filter((a: { numero: string }) => a.numero === '045/2025')).toHaveLength(0);
  });
});

describe('Estoque do galpão (RF31/RF32)', () => {
  it('registra entrada no estoque do galpão do usuário logado', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({ id: UUID } as never);
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'galpao-1', tipo: 'GALPAO' } as never);
    prismaMock.estoqueGalpao.upsert.mockResolvedValue({
      id: 'est-1',
      quantidade: 10,
      tipoEquipamento: {},
    } as never);
    const res = await request(app)
      .post('/estoque/entrada')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 2 });
    expect(res.status).toBe(200);
    expect(prismaMock.estoqueGalpao.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId: UUID, unidadeId: 'galpao-1' } },
      }),
    );
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia saída acima do disponível', async () => {
    prismaMock.estoqueGalpao.findUnique.mockResolvedValue({ id: 'est-1', quantidade: 1 } as never);
    (prismaMock.estoqueGalpao.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    const res = await request(app)
      .post('/estoque/saida')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 3, unidadeDestinoId: UUID });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('indisponível');
    expect(prismaMock.movimentacaoEstoque.create).not.toHaveBeenCalled();
  });

  it('saída debita de forma condicional (quantidade >= pedido) para não ficar negativa sob concorrência', async () => {
    prismaMock.estoqueGalpao.findUnique.mockResolvedValue({ id: 'est-1', quantidade: 5 } as never);
    const res = await request(app)
      .post('/estoque/saida')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 3, unidadeDestinoId: UUID });
    expect(res.status).toBe(200);
    expect(prismaMock.estoqueGalpao.updateMany).toHaveBeenCalledWith({
      where: { id: 'est-1', quantidade: { gte: 3 } },
      data: { quantidade: { decrement: 3 } },
    });
  });

  it('galpão ignora o unidadeId do corpo e opera sempre o próprio estoque', async () => {
    prismaMock.estoqueGalpao.findUnique.mockResolvedValue({ id: 'est-1', quantidade: 5 } as never);
    const OUTRO = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8c0';
    const res = await request(app)
      .post('/estoque/saida')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 1, unidadeDestinoId: UUID, unidadeId: OUTRO });
    expect(res.status).toBe(200);
    expect(prismaMock.estoqueGalpao.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId: UUID, unidadeId: 'galpao-1' } },
      }),
    );
  });

  it('galpão não consegue listar o estoque de outro galpão pela query', async () => {
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([]);
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([]);
    const res = await request(app)
      .get('/estoque?unidadeId=galpao-2')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.estoqueGalpao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unidadeId: 'galpao-1' } }),
    );
  });

  it('lista o estoque com o total em reserva por tipo, agregado entre galpões (feedback 20/08)', async () => {
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-1', tipoEquipamentoId: UUID, unidadeId: 'galpao-1', quantidade: 5, tipoEquipamento: {}, unidade: {} },
    ] as never);
    (prismaMock.solicitacao.groupBy as jest.Mock).mockResolvedValue([
      { tipoEquipamentoId: UUID, _sum: { quantidade: 3 } },
    ]);
    const res = await request(app)
      .get('/estoque?unidadeId=galpao-1')
      .set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ quantidade: 5, reservado: 3 });
  });

});

describe('Dashboard (UC21, RF36/RF37)', () => {
  it('retorna indicadores consolidados para o gestor', async () => {
    prismaMock.equipamento.count.mockResolvedValueOnce(280).mockResolvedValueOnce(18);
    prismaMock.manutencao.findMany
      .mockResolvedValueOnce([
        {
          dataEnvio: new Date('2026-06-01'),
          dataConclusao: new Date('2026-06-13'),
          custoFinal: new Prisma.Decimal(1500),
        },
      ] as never)
      .mockResolvedValueOnce([
        { custoFinal: new Prisma.Decimal(1500), dataConclusao: new Date() },
      ] as never);
    (prismaMock.equipamento.groupBy as unknown as jest.Mock).mockResolvedValue([
      { unidadeId: 'u-1', _count: { id: 45 } },
    ]);
    (prismaMock.solicitacao.groupBy as unknown as jest.Mock).mockResolvedValue([
      { unidadeOrigemId: 'u-1', _count: { id: 23 } },
    ]);
    prismaMock.unidade.findMany.mockResolvedValue([{ id: 'u-1', nome: 'UBS Norte' }] as never);

    const res = await request(app).get('/dashboard').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.totalEquipamentos).toBe(280);
    expect(res.body.emManutencao).toBe(18);
    expect(res.body.tempoMedioManutencaoDias).toBe(12);
    expect(res.body.custoSemestral).toHaveLength(6);
    expect(res.body.rankingSolicitacoes[0].unidade).toBe('UBS Norte');
  });

  it('inclui empréstimos atrasados nas pendências do Administrador (FA05)', async () => {
    prismaMock.manutencao.count.mockResolvedValue(0);
    prismaMock.solicitacao.count.mockImplementation(async (args: { where?: { tipo?: string } }) =>
      args?.where?.tipo === 'EMPRESTIMO' ? 2 : 0,
    );
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/dashboard/alertas').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'EMPRESTIMO_ATRASADO')).toMatchObject({
      contagem: 2,
      severidade: 'CRITICO',
      href: '/solicitacoes?tipo=EMPRESTIMO&status=AGUARDANDO_RETORNO',
    });
  });

  it('retorno de manutenção do Administrador conta só equipamento (não civil)', async () => {
    prismaMock.solicitacao.count.mockResolvedValue(0);
    prismaMock.manutencao.count.mockImplementation(async (args: {
      where?: { tipo?: string; status?: string; confirmadoGestor?: boolean };
    }) =>
      args?.where?.tipo === 'EQUIPAMENTO' &&
      args?.where?.status === 'AGUARDANDO_RETORNO' &&
      args?.where?.confirmadoGestor === false
        ? 3
        : 0,
    );
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/dashboard/alertas').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'FILA_RETORNO_MANUT')).toMatchObject({
      contagem: 3,
    });
    expect(prismaMock.manutencao.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: 'EQUIPAMENTO',
          status: 'AGUARDANDO_RETORNO',
          confirmadoGestor: false,
        }),
      }),
    );
  });

  it('Unidade vê só pendências da própria unidade', async () => {
    prismaMock.solicitacao.count.mockResolvedValue(1);
    prismaMock.manutencao.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/dashboard/alertas')
      .set(auth('UNIDADE', { unidadeId: 'uni-1' }));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(prismaMock.solicitacao.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unidadeOrigemId: 'uni-1' }) }),
    );
  });

  it('Administrador vê riscos de ata vencida, vencendo e com saldo baixo', async () => {
    const agora = Date.now();
    prismaMock.solicitacao.count.mockResolvedValue(0);
    prismaMock.manutencao.count.mockResolvedValue(0);
    prismaMock.ata.findMany.mockResolvedValue([
      {
        id: 'a1',
        numero: '001/2026',
        vencimento: new Date(agora - 2 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        saldo: new Prisma.Decimal(500),
        ativo: true,
      },
      {
        id: 'a2',
        numero: '002/2026',
        vencimento: new Date(agora + 5 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        saldo: new Prisma.Decimal(50),
        ativo: true,
      },
      {
        id: 'a3',
        numero: '003/2026',
        vencimento: new Date(agora + 1 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        saldo: new Prisma.Decimal(500),
        ativo: true,
      },
    ] as never);
    prismaMock.contrato.findMany.mockResolvedValue([] as never);

    const res = await request(app).get('/dashboard/alertas').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'ATA_VENCIDA')).toMatchObject({
      mensagem: 'Ata 001/2026 está vencida',
      severidade: 'CRITICO',
    });
    expect(res.body.find((a: { tipo: string; mensagem: string }) => a.mensagem.includes('002/2026') && a.tipo === 'ATA_VENCIMENTO')).toMatchObject({
      mensagem: expect.stringMatching(/vence em \d+ dias/),
      severidade: 'AVISO',
    });
    expect(res.body.find((a: { tipo: string; mensagem: string }) => a.mensagem.includes('003/2026') && a.tipo === 'ATA_VENCIMENTO')).toMatchObject({
      mensagem: 'Ata 003/2026 vence em 1 dia',
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'ATA_SALDO_BAIXO')).toMatchObject({
      mensagem: expect.stringContaining('Ata 002/2026 com saldo baixo'),
      severidade: 'CRITICO',
    });
  });

  it('Administrador vê riscos de contrato expirado, vencendo, renovação e saldo baixo', async () => {
    const agora = Date.now();
    prismaMock.solicitacao.count.mockResolvedValue(0);
    prismaMock.manutencao.count.mockResolvedValue(0);
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    prismaMock.contrato.findMany.mockResolvedValue([
      {
        id: 'c1',
        numero: 'C-1',
        status: 'ATIVO',
        vigenciaFim: new Date(agora - 86400000),
        valorTotal: new Prisma.Decimal(1000),
        itens: [{ id: 'i1', valor: new Prisma.Decimal(1000) }],
      },
      {
        id: 'c2',
        numero: 'C-2',
        status: 'ATIVO',
        vigenciaFim: new Date(agora + 10 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        itens: [{ id: 'i2', valor: new Prisma.Decimal(1000) }],
      },
      {
        id: 'c3',
        numero: 'C-3',
        status: 'RENOVACAO_PENDENTE',
        vigenciaFim: new Date(agora + 60 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        itens: [{ id: 'i3', valor: new Prisma.Decimal(1000) }],
      },
      {
        id: 'c4',
        numero: 'C-4',
        status: 'ATIVO',
        vigenciaFim: new Date(agora + 60 * 86400000),
        valorTotal: new Prisma.Decimal(1000),
        itens: [{ id: 'i4', valor: new Prisma.Decimal(1000) }],
      },
    ] as never);
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ item: 'i4', total: 950 }]);

    const res = await request(app).get('/dashboard/alertas').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'CONTRATO_EXPIRADO')).toMatchObject({
      mensagem: 'Contrato C-1 está expirado',
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'CONTRATO_VENCIMENTO')).toMatchObject({
      mensagem: expect.stringMatching(/Contrato C-2 vence/),
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'CONTRATO_RENOVACAO')).toMatchObject({
      mensagem: 'Contrato C-3 com renovação pendente',
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'CONTRATO_SALDO_BAIXO')).toMatchObject({
      mensagem: expect.stringContaining('Contrato C-4 com saldo baixo'),
      severidade: 'CRITICO',
    });
  });

  it('Galpão vê estoque zero e estoque baixo do próprio galpão', async () => {
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { quantidade: 0 },
      { quantidade: 0 },
      { quantidade: 2 },
      { quantidade: 10 },
    ] as never);
    const res = await request(app)
      .get('/dashboard/alertas')
      .set(auth('GALPAO', { unidadeId: 'gal-1' }));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'ESTOQUE_ESGOTADO')).toMatchObject({
      contagem: 2,
      severidade: 'CRITICO',
      href: '/estoque',
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'ESTOQUE_BAIXO')).toMatchObject({
      contagem: 1,
      severidade: 'AVISO',
    });
    expect(prismaMock.estoqueGalpao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unidadeId: 'gal-1' } }),
    );
  });

  it('Terceirizada vê a fila do próprio prestador e riscos dos seus contratos', async () => {
    const agora = Date.now();
    prismaMock.manutencao.count.mockImplementation(async (args: { where?: { status?: string } }) =>
      args?.where?.status === 'AGUARDANDO_ORCAMENTO' ? 2 : args?.where?.status === 'AGUARDANDO_EXECUCAO' ? 1 : 0,
    );
    prismaMock.contrato.findMany.mockResolvedValue([
      {
        id: 'c1',
        numero: 'CT-9',
        status: 'EXPIRADO',
        vigenciaFim: new Date(agora + 10 * 86400000),
        valorTotal: null,
        itens: [],
      },
    ] as never);
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get('/dashboard/alertas')
      .set(auth('TERCEIRIZADA', { prestadorId: 'pre-1' }));
    expect(res.status).toBe(200);
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'FILA_ORCAMENTO_PRESTADOR')).toMatchObject({
      contagem: 2,
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'FILA_INICIAR_EXECUCAO')).toMatchObject({
      contagem: 1,
    });
    expect(res.body.find((a: { tipo: string }) => a.tipo === 'CONTRATO_EXPIRADO')).toMatchObject({
      mensagem: 'Contrato CT-9 está expirado',
    });
    expect(prismaMock.contrato.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ prestadorId: 'pre-1' }) }),
    );
  });

  it('sem unidade ou prestador no token a lista de alertas fica vazia', async () => {
    const vaziaUnidade = await request(app).get('/dashboard/alertas').set(auth('UNIDADE', { unidadeId: null }));
    expect(vaziaUnidade.status).toBe(200);
    expect(vaziaUnidade.body).toEqual([]);

    const vaziaGalpao = await request(app).get('/dashboard/alertas').set(auth('GALPAO', { unidadeId: null }));
    expect(vaziaGalpao.status).toBe(200);
    expect(vaziaGalpao.body).toEqual([]);

    const vaziaTerceirizada = await request(app)
      .get('/dashboard/alertas')
      .set(auth('TERCEIRIZADA', { prestadorId: null }));
    expect(vaziaTerceirizada.status).toBe(200);
    expect(vaziaTerceirizada.body).toEqual([]);
  });
});

describe('Saúde da aplicação', () => {
  it('GET /health responde ok quando o banco está acessível', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health responde 503 quando o banco está fora', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
  });
});
