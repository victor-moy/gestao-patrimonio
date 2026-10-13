import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

describe('Autenticação (RF01, RF03, RF04, RNF04)', () => {
  const usuario = {
    id: 'user-1',
    nome: 'Samuel',
    email: 'gestor@joinville.sc.gov.br',
    matricula: '10001',
    senhaHash: bcrypt.hashSync('senha-correta', 10),
    perfil: 'OPERADOR' as const,
    ativo: true,
    unidadeId: null,
    criadoEm: new Date(),
    unidade: null,
  };

  it('realiza login com e-mail e senha válidos e retorna JWT', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuario as never);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: usuario.email, senha: 'senha-correta' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.perfil).toBe('OPERADOR');
    expect((jwt.verify(res.body.token, 'segredo-de-teste') as jwt.JwtPayload).impersonadoPor).toBeUndefined();
  });

  it('rejeita senha incorreta sem revelar detalhes (RNF11)', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(usuario as never);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: usuario.email, senha: 'senha-errada' });
    expect(res.status).toBe(401);
    expect(res.body.mensagem).toBe('E-mail ou senha inválidos.');
  });

  it('rejeita usuário desativado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...usuario, ativo: false } as never);
    const res = await request(app)
      .post('/auth/login')
      .send({ email: usuario.email, senha: 'senha-correta' });
    expect(res.status).toBe(401);
  });

  it('valida o corpo do login (422 para e-mail inválido)', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'x', senha: '' });
    expect(res.status).toBe(422);
  });

  it('bloqueia rota protegida sem token', async () => {
    const res = await request(app).get('/equipamentos');
    expect(res.status).toBe(401);
  });

  it('bloqueia token inválido', async () => {
    const res = await request(app)
      .get('/equipamentos')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me retorna o usuário autenticado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({
      id: 'user-1',
      nome: 'Samuel',
      email: usuario.email,
      matricula: '10001',
      perfil: 'OPERADOR',
      unidadeId: null,
      unidade: null,
    } as never);
    const res = await request(app).get('/auth/me').set(auth('OPERADOR'));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuario.email);
  });
});

describe('Impersonação (o Administrador "entra como" outro usuário)', () => {
  const unidadeUsuario = {
    id: 'user-2',
    nome: 'Ana da Unidade',
    email: 'ana@joinville.sc.gov.br',
    matricula: '10002',
    perfil: 'UNIDADE' as const,
    ativo: true,
    unidadeId: 'unidade-1',
    criadoEm: new Date(),
    unidade: { id: 'unidade-1', nome: 'UBSF Bucarein' },
  };

  it('permite que o Gestor de Patrimônio entre como outro usuário e retorna um novo token', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(unidadeUsuario as never);
    const res = await request(app)
      .post('/auth/impersonar/user-2')
      .set(auth('OPERADOR'))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.perfil).toBe('UNIDADE');
    expect(res.body.usuario.unidadeNome).toBe('UBSF Bucarein');
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('rejeita usuário alvo inexistente ou inativo', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/auth/impersonar/user-999')
      .set(auth('OPERADOR'))
      .send();
    expect(res.status).toBe(404);
  });

  it('o Administrador entra como qualquer perfil e a entrada é auditada com o perfil de quem entrou', async () => {
    const op = () => auth('OPERADOR', { sub: 'op-1' });
    for (const perfil of ['UNIDADE', 'TERCEIRIZADA', 'GALPAO', 'OPERADOR'] as const) {
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, perfil, prestador: { nome: 'X' } } as never);
      const res = await request(app).post('/auth/impersonar/user-2').set(op()).send();
      expect([perfil, res.status]).toEqual([perfil, 200]);
    }
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.dadosDepois).toMatchObject({
      impersonadoPor: { perfil: 'OPERADOR' },
    });
  });

  it('o token de impersonação traz o administrador; a sessão do alvo não se passa por login dele', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(unidadeUsuario as never);
    const res = await request(app)
      .post('/auth/impersonar/user-2')
      .set(auth('OPERADOR', { sub: 'op-1', nome: 'Samuel' }))
      .send();
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, 'segredo-de-teste') as jwt.JwtPayload;
    expect(payload.sub).toBe('user-2');
    expect(payload.impersonadoPor).toEqual({ id: 'op-1', nome: 'Samuel', perfil: 'OPERADOR' });
  });

  it('a lista de quem pode ser assumido traz só dados básicos e inclui o próprio administrador, primeiro', async () => {
    const base = { perfil: 'OPERADOR', unidade: null, prestador: null };
    prismaMock.usuario.findMany.mockResolvedValue([
      { id: 'a', nome: 'Ana', ...base },
      { id: 'op-1', nome: 'Você', ...base },
    ] as never);
    const lista = await request(app).get('/auth/impersonaveis').set(auth('OPERADOR', { sub: 'op-1' }));
    expect(lista.body.map((u: { id: string; proprio: boolean }) => [u.id, u.proprio])).toEqual([
      ['op-1', true],
      ['a', false],
    ]);
    const filtro = prismaMock.usuario.findMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, unknown> };
    expect(filtro.where).toMatchObject({ ativo: true });
    expect(filtro.where).not.toHaveProperty('id');
    expect(filtro.where).not.toHaveProperty('perfil');
    expect(filtro.select).not.toHaveProperty('email');
    expect(filtro.select).not.toHaveProperty('senhaHash');
  });

  it('outros perfis não listam nem assumem ninguém', async () => {
    for (const perfil of ['UNIDADE', 'GALPAO', 'TERCEIRIZADA'] as const) {
      const opcoes = { unidadeId: 'u-1', prestadorId: 'p-1' };
      expect((await request(app).get('/auth/impersonaveis').set(auth(perfil, opcoes))).status).toBe(403);
      expect((await request(app).post('/auth/impersonar/user-2').set(auth(perfil, opcoes)).send()).status).toBe(403);
    }
  });

  it('bloqueia perfis que não sejam Administrador (RN04)', async () => {
    const res = await request(app)
      .post('/auth/impersonar/user-2')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send();
    expect(res.status).toBe(403);
  });
});

describe('RBAC (RNF05, RN03, RN04)', () => {
  it('impede que a Unidade aprove manutenções (RN03)', async () => {
    const res = await request(app)
      .post('/manutencoes/abc/aprovar')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }))
      .send({});
    expect(res.status).toBe(403);
  });

  it('impede que a Unidade acesse o dashboard gerencial', async () => {
    const res = await request(app)
      .get('/dashboard')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }));
    expect(res.status).toBe(403);
  });

  it('impede que a Unidade cadastre equipamentos', async () => {
    const res = await request(app)
      .post('/equipamentos')
      .set(auth('UNIDADE', { unidadeId: 'u-1' }))
      .send({});
    expect(res.status).toBe(403);
  });
});
