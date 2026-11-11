import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const UNIDADE = '11111111-1111-4111-8111-111111111111';
const SETOR = '33333333-3333-4333-8333-333333333333';
const operador = (permissoes: string[]) => auth('OPERADOR', { permissoes });

describe('Setores', () => {
  it('cadastra setor com permissão de configurações e audita', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: UNIDADE } as never);
    prismaMock.setor.findUnique.mockResolvedValue(null as never);
    prismaMock.setor.create.mockResolvedValue({ id: SETOR, nome: 'Recepção', unidadeId: UNIDADE } as never);
    const res = await request(app).post('/setores').set(operador(['CONFIGURACOES_GERENCIAR'])).send({ nome: 'Recepção', unidadeId: UNIDADE });
    expect(res.status).toBe(201);
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.acao).toBe('CADASTRAR_SETOR');
  });

  it('recusa nome repetido na mesma unidade', async () => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: UNIDADE } as never);
    prismaMock.setor.findUnique.mockResolvedValue({ id: 'outro' } as never);
    const res = await request(app).post('/setores').set(operador(['CONFIGURACOES_GERENCIAR'])).send({ nome: 'Recepção', unidadeId: UNIDADE });
    expect(res.status).toBe(409);
    expect(prismaMock.setor.create).not.toHaveBeenCalled();
  });

  it('só quem configura cadastra; o avaliador apenas lista', async () => {
    const corpo = { nome: 'Recepção', unidadeId: UNIDADE };
    expect((await request(app).post('/setores').set(operador(['MANUTENCAO_AVALIAR'])).send(corpo)).status).toBe(403);
    expect((await request(app).post('/setores').set(auth('UNIDADE', { unidadeId: UNIDADE })).send(corpo)).status).toBe(403);
    prismaMock.setor.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/setores').set(operador(['MANUTENCAO_AVALIAR']))).status).toBe(200);
    expect((await request(app).get('/setores').set(operador(['ATAS_GERENCIAR']))).status).toBe(403);
  });

  it('a Unidade lista só os setores ativos da própria unidade, ignorando a query', async () => {
    prismaMock.setor.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/setores?unidadeId=outra').set(auth('UNIDADE', { unidadeId: UNIDADE }));
    expect(res.status).toBe(200);
    expect(prismaMock.setor.findMany.mock.calls[0][0]).toMatchObject({ where: { unidadeId: UNIDADE, ativo: true } });
  });

  it('não exclui setor usado em chamados', async () => {
    prismaMock.setor.findUnique.mockResolvedValue({ id: SETOR, nome: 'Recepção', _count: { manutencoes: 2 } } as never);
    const res = await request(app).delete(`/setores/${SETOR}`).set(operador(['CONFIGURACOES_GERENCIAR']));
    expect(res.status).toBe(422);
    expect(prismaMock.setor.delete).not.toHaveBeenCalled();
  });
});
