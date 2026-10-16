import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const AVISO_ID = '11111111-1111-4111-8111-111111111111';

describe('Avisos in-app (Home)', () => {
  it('lista só os avisos do usuário autenticado', async () => {
    prismaMock.avisoUsuario.findMany.mockResolvedValue([
      {
        id: AVISO_ID,
        tipo: 'SOLICITACAO_APROVADA',
        titulo: 'Solicitação aprovada',
        mensagem: 'SOL-0001 foi aprovada.',
        href: '/solicitacoes/s1',
        solicitacaoId: 's1',
        manutencaoId: null,
        lidaEm: null,
        criadoEm: new Date('2026-10-15T12:00:00Z'),
      },
    ] as never);
    prismaMock.avisoUsuario.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/avisos?apenasNaoLidas=1')
      .set(auth('UNIDADE', { sub: 'u-1', unidadeId: 'uni-1' }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 1,
      itens: expect.arrayContaining([expect.objectContaining({ id: AVISO_ID })]),
    });
    expect(res.body.itens).toHaveLength(1);
    expect(prismaMock.avisoUsuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: 'u-1', lidaEm: null },
      }),
    );
    expect(prismaMock.avisoUsuario.count).toHaveBeenCalledWith({
      where: { usuarioId: 'u-1', lidaEm: null },
    });
  });

  it('marca um aviso como lido só se for do próprio usuário', async () => {
    prismaMock.avisoUsuario.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.avisoUsuario.findFirstOrThrow.mockResolvedValue({
      id: AVISO_ID,
      tipo: 'SOLICITACAO_APROVADA',
      titulo: 'Solicitação aprovada',
      mensagem: 'SOL-0001 foi aprovada.',
      href: '/solicitacoes/s1',
      solicitacaoId: 's1',
      manutencaoId: null,
      lidaEm: new Date(),
      criadoEm: new Date(),
    } as never);

    const res = await request(app)
      .post(`/avisos/${AVISO_ID}/ler`)
      .set(auth('OPERADOR', { sub: 'op-1' }));

    expect(res.status).toBe(200);
    expect(prismaMock.avisoUsuario.updateMany).toHaveBeenCalledWith({
      where: { id: AVISO_ID, usuarioId: 'op-1', lidaEm: null },
      data: { lidaEm: expect.any(Date) },
    });
  });

  it('marca todos os avisos não lidos do usuário', async () => {
    prismaMock.avisoUsuario.updateMany.mockResolvedValue({ count: 3 });
    const res = await request(app).post('/avisos/ler-todas').set(auth('OPERADOR', { sub: 'op-1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marcados: 3 });
  });

  it('retorna 404 ao marcar aviso inexistente do usuário', async () => {
    prismaMock.avisoUsuario.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.avisoUsuario.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .post(`/avisos/${AVISO_ID}/ler`)
      .set(auth('OPERADOR', { sub: 'op-1' }));
    expect(res.status).toBe(404);
    expect(res.body.mensagem).toMatch(/não encontrado/i);
  });

  it('aceita limite inválido e usa o padrão', async () => {
    prismaMock.avisoUsuario.findMany.mockResolvedValue([] as never);
    prismaMock.avisoUsuario.count.mockResolvedValue(0);
    const res = await request(app)
      .get('/avisos?apenasNaoLidas=true&limite=abc')
      .set(auth('OPERADOR', { sub: 'op-1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.avisoUsuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});
