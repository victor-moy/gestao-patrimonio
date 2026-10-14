import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const terc = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: 'prestador-1' });

describe('Tabela SINAPI', () => {
  it('Administrador e terceirizada consultam; Unidade e Galpão não', async () => {
    prismaMock.itemSinapi.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/sinapi').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).get('/sinapi').set(terc())).status).toBe(200);
    expect((await request(app).get('/sinapi').set(auth('UNIDADE', { unidadeId: 'u-1' }))).status).toBe(403);
    expect((await request(app).get('/sinapi').set(auth('GALPAO'))).status).toBe(403);
    expect((await request(app).get('/sinapi')).status).toBe(401);
  });

  it('lista só itens ativos, filtra por código ou descrição e limita o resultado', async () => {
    prismaMock.itemSinapi.findMany.mockResolvedValue([] as never);
    await request(app).get('/sinapi').query({ busca: 'sifão' }).set(terc());
    const args = prismaMock.itemSinapi.findMany.mock.calls[0][0]!;
    expect(args.where).toMatchObject({ ativo: true, OR: expect.any(Array) });
    expect(args.take).toBe(50);
  });
});
