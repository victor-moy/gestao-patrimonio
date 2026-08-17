import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const equipamentoBase = {
  id: 'eq-1',
  tombamento: '12345/2024',
  descricao: 'Autoclave Vertical 75L',
  tipoEquipamentoId: 'tipo-1',
  unidadeId: 'unidade-1',
  unidadeTemporariaId: null,
  estadoConservacao: 'BOM',
  status: 'ATIVO',
  emendaParlamentar: false,
  dataAquisicao: new Date('2024-01-14'),
  observacoes: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

describe('Inventário (RF06-RF10, RN01)', () => {
  it('lista equipamentos para o gestor (RF09)', async () => {
    prismaMock.equipamento.findMany.mockResolvedValue([equipamentoBase] as never);
    const res = await request(app).get('/equipamentos').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // Gestor não recebe filtro de unidade
    expect(prismaMock.equipamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('restringe a Unidade ao próprio inventário (RF08)', async () => {
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    await request(app)
      .get('/equipamentos')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(prismaMock.equipamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unidadeId: 'unidade-1' } }),
    );
  });

  it('bloqueia usuário de unidade sem vínculo', async () => {
    const res = await request(app).get('/equipamentos').set(auth('UNIDADE'));
    expect(res.status).toBe(403);
  });

  it('cadastra equipamento pelo Galpão com movimentação (UC02/RF06)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(null);
    prismaMock.equipamento.create.mockResolvedValue({
      ...equipamentoBase,
      unidade: { nome: 'UBS Centro' },
    } as never);
    const res = await request(app)
      .post('/equipamentos')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({
        tombamento: '12345/2024',
        descricao: 'Autoclave Vertical 75L',
        tipoEquipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        unidadeId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b7',
        estadoConservacao: 'BOM',
        emendaParlamentar: false,
      });
    expect(res.status).toBe(201);
    expect(prismaMock.movimentacao.create).toHaveBeenCalled();
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita tombamento duplicado (RN01/FA07)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoBase as never);
    const res = await request(app)
      .post('/equipamentos')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({
        tombamento: '12345/2024',
        descricao: 'Duplicado',
        tipoEquipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        unidadeId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b7',
        estadoConservacao: 'BOM',
        emendaParlamentar: false,
      });
    expect(res.status).toBe(409);
    expect(prismaMock.equipamento.create).not.toHaveBeenCalled();
  });

  it('não permite alterar o tombamento na atualização (RN01)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoBase as never);
    prismaMock.equipamento.update.mockResolvedValue(equipamentoBase as never);
    const res = await request(app)
      .patch('/equipamentos/eq-1')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ descricao: 'Nova descrição', tombamento: '99999/2099' });
    expect(res.status).toBe(200);
    const dadosUpdate = prismaMock.equipamento.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(dadosUpdate.tombamento).toBeUndefined();
  });

  it('impede unidade de ver equipamento de outra unidade', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoBase,
      movimentacoes: [],
      manutencoes: [],
      tipoEquipamento: { categoria: {} },
      unidade: { id: 'unidade-1', nome: 'UBS Centro' },
      unidadeTemporaria: null,
    } as never);
    const res = await request(app)
      .get('/equipamentos/eq-1')
      .set(auth('UNIDADE', { unidadeId: 'outra-unidade' }));
    expect(res.status).toBe(403);
  });
});

describe('Baixa manual de equipamento (leilão, extravio, roubo)', () => {
  it('dá baixa manual com motivo e registra auditoria', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoBase as never);
    prismaMock.equipamento.update.mockResolvedValue({
      ...equipamentoBase,
      status: 'BAIXADO',
      motivoBaixa: 'LEILAO',
    } as never);
    const res = await request(app)
      .post('/equipamentos/eq-1/baixa')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ motivo: 'LEILAO', observacao: 'Lote 12/2026' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eq-1' },
        data: { status: 'BAIXADO', motivoBaixa: 'LEILAO' },
      }),
    );
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia baixa de equipamento já baixado', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoBase,
      status: 'BAIXADO',
    } as never);
    const res = await request(app)
      .post('/equipamentos/eq-1/baixa')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ motivo: 'EXTRAVIO' });
    expect(res.status).toBe(422);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('rejeita motivo de baixa inválido', async () => {
    const res = await request(app)
      .post('/equipamentos/eq-1/baixa')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ motivo: 'INVALIDO' });
    expect(res.status).toBe(422);
  });
});
