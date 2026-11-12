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

describe('Impersonação (qualquer usuário "entra como" um usuário de teste)', () => {
  const unidadeUsuario = {
    id: 'user-2',
    nome: 'Ana da Unidade',
    email: 'ana@joinville.sc.gov.br',
    matricula: '10002',
    perfil: 'UNIDADE' as const,
    ativo: true,
    usuarioTeste: true,
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
    // só contas de teste, mais a do próprio ator para ele poder voltar
    expect(filtro.where).toMatchObject({ OR: [{ usuarioTeste: true }, { id: 'op-1' }] });
    expect(filtro.where).not.toHaveProperty('id');
    expect(filtro.where).not.toHaveProperty('perfil');
    expect(filtro.select).not.toHaveProperty('email');
    expect(filtro.select).not.toHaveProperty('senhaHash');
  });

  it('não entra em quem não é usuário de teste, mas volta à própria conta mesmo que ela não seja de teste', async () => {
    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, usuarioTeste: false } as never);
    const recusado = await request(app).post('/auth/impersonar/user-2').set(auth('OPERADOR', { sub: 'op-1' })).send();
    expect(recusado.status).toBe(403);
    expect(recusado.body.mensagem).toMatch(/não é de teste/);
    expect(prismaMock.logAuditoria.create).not.toHaveBeenCalled();

    const dentro = auth('UNIDADE', { sub: 'user-2', impersonadoPor: { id: 'op-1', nome: 'Samuel', perfil: 'OPERADOR' } });
    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, id: 'op-1', perfil: 'OPERADOR', usuarioTeste: false } as never);
    const volta = await request(app).post('/auth/impersonar/op-1').set(dentro).send();
    expect(volta.status).toBe(200);
  });

  it('a lista de quem pode ser assumido, a partir de uma sessão assumida, mantém o ator original para voltar', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    await request(app)
      .get('/auth/impersonaveis')
      .set(auth('UNIDADE', { sub: 'user-2', impersonadoPor: { id: 'op-1', nome: 'Samuel', perfil: 'OPERADOR' } }));
    const filtro = prismaMock.usuario.findMany.mock.calls[0][0] as { where: unknown };
    expect(filtro.where).toMatchObject({ OR: [{ usuarioTeste: true }, { id: 'op-1' }] });
  });

  it('quem está sem acesso não lista nem assume ninguém: o "Entrar como" não existe para esse perfil', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const lista = await request(app).get('/auth/impersonaveis').set(auth('SEM_ACESSO'));
    expect(lista.status).toBe(403);
    const res = await request(app).post(`/auth/impersonar/${uuid}`).set(auth('SEM_ACESSO')).send();
    expect(res.status).toBe(403);
    expect(prismaMock.usuario.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.usuario.findMany).not.toHaveBeenCalled();
  });

  it('os demais perfis listam e assumem um usuário de teste (decisão temporária, só dados de teste)', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    for (const perfil of ['UNIDADE', 'GALPAO', 'TERCEIRIZADA'] as const) {
      const opcoes = { unidadeId: 'u-1', prestadorId: 'p-1' };
      prismaMock.usuario.findMany.mockResolvedValueOnce([] as never);
      const lista = await request(app).get('/auth/impersonaveis').set(auth(perfil, opcoes));
      expect([perfil, lista.status]).toEqual([perfil, 200]);
      prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, id: uuid } as never);
      const res = await request(app).post(`/auth/impersonar/${uuid}`).set(auth(perfil, opcoes)).send();
      expect([perfil, res.status]).toEqual([perfil, 200]);
    }
  });

  it('a troca a partir de um usuário já assumido guarda o ator original; voltar à própria conta limpa o token', async () => {
    const dentro = auth('UNIDADE', { sub: 'user-2', impersonadoPor: { id: 'op-1', nome: 'Samuel', perfil: 'OPERADOR' } });
    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, id: 'user-3' } as never);
    const outro = await request(app).post('/auth/impersonar/user-3').set(dentro).send();
    const p1 = jwt.verify(outro.body.token, 'segredo-de-teste') as jwt.JwtPayload;
    expect(p1.impersonadoPor).toEqual({ id: 'op-1', nome: 'Samuel', perfil: 'OPERADOR' });

    prismaMock.usuario.findUnique.mockResolvedValueOnce({ ...unidadeUsuario, id: 'op-1', perfil: 'OPERADOR' } as never);
    const volta = await request(app).post('/auth/impersonar/op-1').set(dentro).send();
    const p2 = jwt.verify(volta.body.token, 'segredo-de-teste') as jwt.JwtPayload;
    expect(p2.sub).toBe('op-1');
    expect(p2.impersonadoPor).toBeUndefined();
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
    for (const rota of ['/equipamentos', '/solicitacoes', '/manutencoes', '/contratos', '/atas', '/estoque', '/usuarios', '/relatorios/visao-geral', '/auth/impersonaveis']) {
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
