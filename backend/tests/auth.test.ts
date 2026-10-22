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

  it('não existe mais login por senha: a rota não é atendida', async () => {
    const res = await request(app).post('/auth/login').send({ email: usuario.email, senha: 'senha-correta' });
    expect(res.status).toBe(404);
    expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled();
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

describe('Login pelo Keycloak', () => {
  const identidade = { sub: 'kc-sub-1', email: 'ana@joinville.sc.gov.br', nome: 'Ana Souza', usuario: 'ana.souza' };
  const existente = {
    id: 'user-9',
    nome: 'Ana Souza',
    email: 'ana@joinville.sc.gov.br',
    matricula: '10009',
    senhaHash: null,
    keycloakSub: null,
    perfil: 'UNIDADE' as const,
    ativo: true,
    unidadeId: 'unidade-1',
    prestadorId: null,
    unidade: { id: 'unidade-1', nome: 'UBSF Bucarein' },
    prestador: null,
  };

  it('usuário já vinculado entra pelo sub e mantém perfil e unidade', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...existente, keycloakSub: identidade.sub } as never);
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    const sessao = await entrarPeloKeycloak(identidade);
    expect(sessao.usuario.perfil).toBe('UNIDADE');
    expect(prismaMock.usuario.create).not.toHaveBeenCalled();
  });

  it('usuário que já existia no SGP é vinculado pelo e-mail no primeiro login, sem perder o perfil', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findFirst.mockResolvedValue(existente as never);
    prismaMock.usuario.updateMany.mockResolvedValue({ count: 1 });
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    const sessao = await entrarPeloKeycloak(identidade);
    expect(sessao.usuario.perfil).toBe('UNIDADE');
    expect(prismaMock.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-9', keycloakSub: null },
      data: { keycloakSub: 'kc-sub-1' },
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.acao).toBe('VINCULAR_KEYCLOAK');
  });

  it('cadastro prévio (matrícula igual ao e-mail) recebe nome e matrícula reais do Keycloak ao vincular', async () => {
    const previo = { ...existente, nome: 'ana', matricula: existente.email };
    prismaMock.usuario.findUnique.mockResolvedValue(null); // sem usuário com o sub nem com a matrícula do AD
    prismaMock.usuario.findFirst.mockResolvedValue(previo as never);
    prismaMock.usuario.updateMany.mockResolvedValue({ count: 1 });
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    const sessao = await entrarPeloKeycloak(identidade);
    expect(prismaMock.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-9', keycloakSub: null },
      data: { keycloakSub: 'kc-sub-1', nome: 'Ana Souza', matricula: 'ana.souza' },
    });
    expect(sessao.usuario.nome).toBe('Ana Souza');
    expect(sessao.usuario.perfil).toBe('UNIDADE');
  });

  it('não vincula quando o e-mail já pertence a outra identidade do Keycloak', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findFirst.mockResolvedValue({ ...existente, keycloakSub: 'outro-sub' } as never);
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    await expect(entrarPeloKeycloak(identidade)).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.usuario.updateMany).not.toHaveBeenCalled();
  });

  it('recusa o vínculo se outro login ocupou a conta no meio do caminho', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findFirst.mockResolvedValue(existente as never);
    prismaMock.usuario.updateMany.mockResolvedValue({ count: 0 });
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    await expect(entrarPeloKeycloak(identidade)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('pessoa nova entra como SEM_ACESSO, com a matrícula do login do AD', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(null);
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    prismaMock.usuario.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'novo-1',
      ativo: true,
      unidadeId: null,
      prestadorId: null,
      unidade: null,
      prestador: null,
      ...data,
    })) as never);
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    const sessao = await entrarPeloKeycloak(identidade);
    expect(sessao.usuario.perfil).toBe('SEM_ACESSO');
    expect(prismaMock.usuario.create.mock.calls[0][0].data).toMatchObject({
      perfil: 'SEM_ACESSO',
      matricula: 'ana.souza',
      keycloakSub: 'kc-sub-1',
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.acao).toBe('CRIAR_USUARIO_KEYCLOAK');
  });

  it('usuário desativado não entra', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...existente, keycloakSub: identidade.sub, ativo: false } as never);
    const { entrarPeloKeycloak } = await import('../src/modules/auth/auth.service');
    await expect(entrarPeloKeycloak(identidade)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('SEM_ACESSO só consegue ver /auth/me; qualquer outra rota é negada', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...existente, perfil: 'SEM_ACESSO' } as never);
    const me = await request(app).get('/auth/me').set(auth('SEM_ACESSO'));
    expect(me.status).toBe(200);
    for (const rota of ['/equipamentos', '/solicitacoes', '/avisos', '/auth/impersonaveis']) {
      const res = await request(app).get(rota).set(auth('SEM_ACESSO'));
      expect([rota, res.status]).toEqual([rota, 403]);
    }
  });

  it('o login institucional responde 503 enquanto o Keycloak não está configurado', async () => {
    const res = await request(app).get('/auth/oidc/login');
    expect(res.status).toBe(503);
  });

  it('o retorno do Keycloak sem o cookie de login volta ao frontend com erro, sem criar sessão', async () => {
    const res = await request(app).get('/auth/callback?code=abc&state=xyz');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login/retorno?erro=autenticacao');
    expect(res.headers.location).not.toContain('token=');
  });
});

describe('Cookie do login institucional não serve de token de sessão', () => {
  it('assinado com chave própria: não passa como Bearer nem pela verificação das sessões', async () => {
    const oidc = await import('../src/modules/auth/oidc.service');
    const cookie = oidc.assinarCookieLogin({ state: 's', nonce: 'n', verifier: 'v' });
    expect(() => jwt.verify(cookie, 'segredo-de-teste')).toThrow();
    expect(oidc.lerCookieLogin(cookie)).toEqual({ state: 's', nonce: 'n', verifier: 'v' });
    const res = await request(app).get('/avisos').set('Authorization', `Bearer ${cookie}`);
    expect(res.status).toBe(401);
  });

  it('mesmo assinado com o segredo das sessões, um token sem sujeito ou perfil válido é recusado', async () => {
    const semPerfil = jwt.sign({ state: 's' }, 'segredo-de-teste');
    const perfilInventado = jwt.sign({ nome: 'X', perfil: 'ROOT' }, 'segredo-de-teste', { subject: 'u1' });
    for (const token of [semPerfil, perfilInventado]) {
      const res = await request(app).get('/avisos').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });
});
