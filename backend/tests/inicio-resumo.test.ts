import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
describe('Resumo do início', () => {
  it.each(['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO'] as const)('retorna totais completos para %s sem depender de manutenção ou ranking', async (perfil) => {
    prismaMock.equipamento.count.mockResolvedValue(12);
    prismaMock.equipamento.groupBy.mockResolvedValue([{ unidadeId: 'u1' }, { unidadeId: 'u2' }] as never);
    prismaMock.solicitacao.count.mockResolvedValue(40);
    const res = await request(app).get('/dashboard/resumo').set(auth(perfil));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalEquipamentos: 12, unidadesAtendidas: 2, totalSolicitacoes: 40 });
    expect(prismaMock.equipamento.count).toHaveBeenCalledWith({ where: { status: { not: 'BAIXADO' } } });
    expect(prismaMock.manutencao.findMany).not.toHaveBeenCalled();
  });
  it('restringe o resumo aos gestores', async () => {
    const res = await request(app).get('/dashboard/resumo').set(auth('UNIDADE'));
    expect(res.status).toBe(403);
  });
});
