import request from 'supertest';
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

  it('SEM_ACESSO enxerga só a tela inicial: /auth/me, alertas e atualizações; o resto é negado', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...existente, perfil: 'SEM_ACESSO' } as never);
    const permitidas = ['/auth/me', '/dashboard/alertas', '/avisos', '/conversas', '/conversas/nao-lidas'];
    for (const rota of permitidas) {
      const res = await request(app).get(rota).set(auth('SEM_ACESSO'));
      expect([rota, res.status === 403]).toEqual([rota, false]);
    }
    for (const rota of ['/equipamentos', '/solicitacoes', '/manutencoes', '/contratos', '/atas', '/estoque', '/usuarios', '/relatorios/visao-geral']) {
      const res = await request(app).get(rota).set(auth('SEM_ACESSO'));
      expect([rota, res.status]).toEqual([rota, 403]);
    }
    const escrita = await request(app).post('/solicitacoes').set(auth('SEM_ACESSO')).send({});
    expect(escrita.status).toBe(403);
  });

  it('SEM_ACESSO recebe a Home vazia, sem dados de nenhuma unidade', async () => {
    const res = await request(app).get('/dashboard/alertas').set(auth('SEM_ACESSO'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('qualquer falha do login institucional volta à tela de login, sem detalhes e sem sessão', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const rota of ['/auth/oidc/login', '/auth/callback?code=abc&state=xyz']) {
      const res = await request(app).get(rota);
      expect([rota, res.status]).toEqual([rota, 302]);
      expect(res.headers.location).toBe('/');
      expect(res.headers['set-cookie'] ?? []).not.toEqual(expect.arrayContaining([expect.stringContaining('token')]));
    }
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

describe('Acesso temporário da demonstração (/auth/demo)', () => {
  const CHAVE = 'chave-de-teste-da-demonstracao-0123456789';
  const usuarios: Record<string, { email: string; perfil: string }> = {
    admin: { email: 'gestor@joinville.sc.gov.br', perfil: 'OPERADOR' },
    unidade: { email: 'ubs.centro@joinville.sc.gov.br', perfil: 'UNIDADE' },
    galpao: { email: 'galpao.user@joinville.sc.gov.br', perfil: 'GALPAO' },
    terceirizada: { email: 'terceirizada@tecsaude.com.br', perfil: 'TERCEIRIZADA' },
  };
  const alvo = (logado: string) => ({
    id: `u-${logado}`,
    nome: logado,
    email: usuarios[logado].email,
    matricula: logado,
    perfil: usuarios[logado].perfil,
    ativo: true,
    unidadeId: null,
    prestadorId: null,
    unidade: null,
    prestador: null,
  });

  it.each(Object.keys(usuarios))('com a chave certa, "%s" entra no perfil correspondente e é auditado', async (logado) => {
    prismaMock.usuario.findUnique.mockResolvedValue(alvo(logado) as never);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app).get(`/auth/demo?logado=${logado}&chave=${CHAVE}`);
    expect(res.status).toBe(302);
    const token = decodeURIComponent(res.headers.location.split('#token=')[1]);
    expect((jwt.verify(token, 'segredo-de-teste') as jwt.JwtPayload).perfil).toBe(usuarios[logado].perfil);
    expect(prismaMock.usuario.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: usuarios[logado].email } }));
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data.acao).toBe('LOGIN_DEMONSTRACAO');
  });

  it('sem a chave, com chave errada ou de outro tamanho: 404, sem consultar o banco', async () => {
    for (const q of ['logado=admin', `logado=admin&chave=errada`, `logado=admin&chave=${CHAVE}x`, `logado=admin&chave=${'a'.repeat(CHAVE.length)}`]) {
      const res = await request(app).get(`/auth/demo?${q}`);
      expect([q, res.status]).toEqual([q, 404]);
      expect(res.headers.location).toBeUndefined();
    }
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
  });

  it('com a chave desligada (vazia), nem a chave "vazia" abre a rota', async () => {
    const { env } = await import('../src/config/env');
    const original = env.demoLogin.chave;
    env.demoLogin.chave = '';
    try {
      const res = await request(app).get('/auth/demo?logado=admin&chave=');
      expect(res.status).toBe(404);
    } finally {
      env.demoLogin.chave = original;
    }
  });

  it('perfil desconhecido, usuário ausente, inativo ou com perfil trocado: 404', async () => {
    expect((await request(app).get(`/auth/demo?logado=root&chave=${CHAVE}`)).status).toBe(404);
    expect((await request(app).get(`/auth/demo?logado=__proto__&chave=${CHAVE}`)).status).toBe(404);
    prismaMock.usuario.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get(`/auth/demo?logado=admin&chave=${CHAVE}`)).status).toBe(404);
    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...alvo('admin'), ativo: false } as never);
    expect((await request(app).get(`/auth/demo?logado=admin&chave=${CHAVE}`)).status).toBe(404);
    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...alvo('admin'), perfil: 'SEM_ACESSO' } as never);
    expect((await request(app).get(`/auth/demo?logado=admin&chave=${CHAVE}`)).status).toBe(404);
  });
});
