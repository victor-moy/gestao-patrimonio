import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { numeroDaBusca } from '../src/lib/numero';
import { auth } from './helpers';

const app = criarApp();

describe('numeroDaBusca', () => {
  it.each([
    ['12', 'SOL', 12],
    ['SOL-0012', 'SOL', 12],
    ['sol 12', 'SOL', 12],
    ['#12', 'SOL', 12],
    ['MAN-0007', 'MAN', 7],
  ] as const)('interpreta "%s" como número', (texto, prefixo, esperado) => {
    expect(numeroDaBusca(texto, prefixo)).toBe(esperado);
  });

  it.each([
    ['MAN-0007', 'SOL'],
    ['UBS Centro', 'SOL'],
    ['autoclave 12', 'SOL'],
    ['', 'MAN'],
    ['1234567890', 'MAN'],
  ] as const)('ignora "%s"', (texto, prefixo) => {
    expect(numeroDaBusca(texto, prefixo)).toBeNull();
  });
});

describe('Busca por número da requisição', () => {
  it('solicitações: SOL-0012 filtra pelo número', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    await request(app).get('/solicitacoes?busca=SOL-0012').set(auth('GESTOR_PATRIMONIO'));
    const where = (prismaMock.solicitacao.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toContainEqual({ numero: 12 });
  });

  it('manutenções: MAN-0007 filtra pelo número', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/manutencoes?busca=MAN-0007').set(auth('GESTOR_MANUTENCAO'));
    const where = (prismaMock.manutencao.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toContainEqual({ numero: 7 });
  });

  it('texto comum não vira filtro por número', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    await request(app).get('/solicitacoes?busca=autoclave').set(auth('GESTOR_PATRIMONIO'));
    const where = (prismaMock.solicitacao.findMany.mock.calls[0][0] as { where: { OR: Array<Record<string, unknown>> } }).where;
    expect(where.OR.some((c) => 'numero' in c)).toBe(false);
  });
});
