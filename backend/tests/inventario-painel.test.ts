import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const unidade = '11111111-1111-4111-8111-111111111111';
const categoria = '22222222-2222-4222-8222-222222222222';
const familia = '33333333-3333-4333-8333-333333333333';

describe('Painel do inventário', () => {
  it('agrega todos os tombamentos por unidade, categoria e família, sem buscar os equipamentos', async () => {
    prismaMock.equipamento.groupBy.mockResolvedValue([
      { unidadeId: unidade, tipoEquipamentoId: familia, status: 'ATIVO', _count: { _all: 24 } },
      { unidadeId: unidade, tipoEquipamentoId: familia, status: 'EM_MANUTENCAO', _count: { _all: 2 } },
    ] as never);
    prismaMock.unidade.findMany.mockResolvedValue([{ id: unidade, nome: 'UBSF Centro' }] as never);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([{ id: familia, nome: 'Ar-condicionado', categoriaId: categoria, categoria: { nome: 'Climatização' } }] as never);
    const r = await request(app).get(`/equipamentos/painel?unidadeId=${unidade}&categoriaId=${categoria}&tipoEquipamentoId=${familia}`).set(auth('OPERADOR'));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 26, ativos: 24, emManutencao: 2, unidades: 1, categorias: 1, familias: 1 });
    expect(r.body.porCategoria).toEqual([{ id: categoria, nome: 'Climatização', quantidade: 26 }]);
    expect(prismaMock.equipamento.findMany).not.toHaveBeenCalled();
    expect(prismaMock.equipamento.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { unidadeId: unidade, tipoEquipamentoId: familia, tipoEquipamento: { categoriaId: categoria } } }));
  });
  it('não deixa busca ou unidade solicitada sobrescrever o isolamento da unidade autenticada', async () => {
    prismaMock.equipamento.groupBy.mockResolvedValue([] as never);
    const r = await request(app).get(`/equipamentos/painel?busca=Ar&unidadeId=${unidade}`).set(auth('UNIDADE', { unidadeId: 'minha-unidade' }));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect(prismaMock.equipamento.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { OR: [{ unidadeId: 'minha-unidade' }, { unidadeTemporariaId: 'minha-unidade' }] },
      expect.objectContaining({ unidadeId: unidade, OR: expect.any(Array) }),
    ] } }));
    expect(prismaMock.unidade.findMany).not.toHaveBeenCalled();
  });
  it('aplica o mesmo isolamento na lista quando existe busca', async () => {
    prismaMock.equipamento.findMany.mockResolvedValue([]);
    await request(app).get('/equipamentos?busca=ar').set(auth('UNIDADE', { unidadeId: unidade }));
    expect(prismaMock.equipamento.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { OR: [{ unidadeId: unidade }, { unidadeTemporariaId: unidade }] }, expect.objectContaining({ OR: expect.any(Array) }),
    ] } }));
  });
  it('recusa operador sem permissão, terceirizada, ausência de sessão e unidade sem vínculo', async () => {
    expect((await request(app).get('/equipamentos/painel').set(auth('OPERADOR', { permissoes: [] }))).status).toBe(403);
    expect((await request(app).get('/equipamentos/painel').set(auth('TERCEIRIZADA'))).status).toBe(403);
    expect((await request(app).get('/equipamentos/painel')).status).toBe(401);
    expect((await request(app).get('/equipamentos/painel').set(auth('UNIDADE'))).status).toBe(403);
    expect(prismaMock.equipamento.groupBy).not.toHaveBeenCalled();
  });
  it('valida identificadores, status e limites da busca antes de consultar o banco', async () => {
    for (const q of ['unidadeId=invalido', 'status=QUALQUER', `busca=${'x'.repeat(201)}`]) {
      expect((await request(app).get('/equipamentos/painel?'+q).set(auth('OPERADOR'))).status).toBe(422);
    }
    expect(prismaMock.equipamento.groupBy).not.toHaveBeenCalled();
  });
});
