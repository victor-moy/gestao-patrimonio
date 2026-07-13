import request from 'supertest';
import bcrypt from 'bcryptjs';
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
    perfil: 'GESTOR_PATRIMONIO' as const,
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
    expect(res.body.usuario.perfil).toBe('GESTOR_PATRIMONIO');
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
      perfil: 'GESTOR_PATRIMONIO',
      unidadeId: null,
      unidade: null,
    } as never);
    const res = await request(app).get('/auth/me').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuario.email);
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

  it('impede que o Gestor de Manutenção aprove solicitações de cessão (RN04)', async () => {
    const res = await request(app)
      .post('/solicitacoes/abc/aprovar')
      .set(auth('GESTOR_MANUTENCAO'))
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
