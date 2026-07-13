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
      .set(auth('GESTOR_PATRIMONIO'))
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
      .set(auth('GESTOR_PATRIMONIO'))
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
    const res = await request(app).get('/atas/alertas').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    const tipos = res.body.map((a: { tipo: string }) => a.tipo);
    expect(tipos).toContain('VENCIMENTO');
    expect(tipos).toContain('SALDO_BAIXO');
    expect(res.body.filter((a: { numero: string }) => a.numero === '045/2025')).toHaveLength(0);
  });
});

describe('Estoque do galpão (RF31/RF32)', () => {
  it('registra entrada no estoque interno', async () => {
    prismaMock.tipoEquipamento.findUnique.mockResolvedValue({ id: UUID } as never);
    prismaMock.estoqueGalpao.upsert.mockResolvedValue({
      id: 'est-1',
      quantidadeInterna: 10,
      tipoEquipamento: {},
    } as never);
    const res = await request(app)
      .post('/estoque/entrada')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 2, destino: 'INTERNO' });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia saída acima do disponível', async () => {
    prismaMock.estoqueGalpao.findUnique.mockResolvedValue({
      id: 'est-1',
      quantidadeInterna: 1,
      quantidadeBranet: 5,
      tipoEquipamento: {},
    } as never);
    const res = await request(app)
      .post('/estoque/saida')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 3, origem: 'INTERNO' });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('indisponível');
  });

  it('estoques interno e Branet são movimentados separadamente (RF31)', async () => {
    prismaMock.estoqueGalpao.findUnique.mockResolvedValue({
      id: 'est-1',
      quantidadeInterna: 1,
      quantidadeBranet: 5,
      tipoEquipamento: {},
    } as never);
    prismaMock.estoqueGalpao.update.mockResolvedValue({ id: 'est-1' } as never);
    const res = await request(app)
      .post('/estoque/saida')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ tipoEquipamentoId: UUID, quantidade: 3, origem: 'BRANET' });
    expect(res.status).toBe(200);
    expect(prismaMock.estoqueGalpao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantidadeBranet: { decrement: 3 } },
      }),
    );
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

    const res = await request(app).get('/dashboard').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.totalEquipamentos).toBe(280);
    expect(res.body.emManutencao).toBe(18);
    expect(res.body.tempoMedioManutencaoDias).toBe(12);
    expect(res.body.custoSemestral).toHaveLength(6);
    expect(res.body.rankingSolicitacoes[0].unidade).toBe('UBS Norte');
  });

  it('inclui empréstimos atrasados nos alertas (FA05)', async () => {
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        dataRetornoPrevista: new Date('2026-05-15'),
        equipamento: { tombamento: '12347/2024' },
        unidadeOrigem: { nome: 'UME Guanabara' },
        unidadeDestino: { nome: 'UBS Norte' },
      },
    ] as never);
    const res = await request(app).get('/dashboard/alertas').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body[0].tipo).toBe('EMPRESTIMO_ATRASADO');
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
