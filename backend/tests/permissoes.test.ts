/* eslint-disable security/detect-non-literal-fs-filename -- varredura de arquivos do próprio repositório */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth, mockUsuarioFindFirst } from './helpers';
import fs from 'fs';
import path from 'path';
import { TODAS_PERMISSOES, permissoesValidas } from '../src/lib/permissoes';

const app = criarApp();
const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';
const operador = (permissoes: string[]) => auth('OPERADOR', { permissoes });

describe('Permissões do Operador', () => {
  it('o catálogo ignora valores desconhecidos e repetidos', () => {
    expect(permissoesValidas(['ATAS_GERENCIAR', 'ATAS_GERENCIAR', 'VIRAR_ROOT', 42])).toEqual(['ATAS_GERENCIAR']);
    expect(permissoesValidas('ATAS_GERENCIAR')).toEqual([]);
    expect(permissoesValidas(undefined)).toEqual([]);
  });

  it('o catálogo do frontend é igual ao do backend (ids e rótulos)', () => {
    const extrair = (arquivo: string) =>
      [...fs.readFileSync(path.resolve(__dirname, arquivo), 'utf8').matchAll(/\{ id: '(\w+)', rotulo: '([^']+)' \}/g)].map((m) => `${m[1]}|${m[2]}`);
    const backend = extrair('../src/lib/permissoes.ts');
    expect(backend.length).toBe(TODAS_PERMISSOES.length);
    expect(extrair('../../frontend/src/utils/permissoes.ts')).toEqual(backend);
  });

  it('nenhuma rota usa permitir(Perfil.OPERADOR) sozinho: o perfil não autoriza nada sem permissão', () => {
    const achadas: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of fs.readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (fs.statSync(caminho).isDirectory()) varrer(caminho);
        else if (nome.endsWith('.ts') && /permitir\(\s*Perfil\.OPERADOR\s*\)/.test(fs.readFileSync(caminho, 'utf8'))) achadas.push(caminho);
      }
    };
    varrer(path.resolve(__dirname, '../src'));
    expect(achadas).toEqual([]);
  });

  it('sem a permissão o Operador é barrado; com ela, passa (uma rota por área)', async () => {
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    prismaMock.contrato.findMany.mockResolvedValue([] as never);
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    mockUsuarioFindFirst(prismaMock.usuario.findFirst);
    // Leitura de contratos também vale para quem consulta chamados (para triar, avaliar e escolher o item do contrato)
    const tambem: Record<string, string[]> = { '/contratos': ['MANUTENCAO_CONSULTAR', 'MANUTENCAO_AVALIAR'] };
    const casos: Array<[string, string]> = [
      ['/atas', 'ATAS_GERENCIAR'],
      ['/contratos', 'CONTRATOS_GERENCIAR'],
      ['/manutencoes', 'MANUTENCAO_CONSULTAR'],
      ['/relatorios/visao-geral', 'RELATORIOS_VISUALIZAR'],
      ['/estoque', 'ESTOQUE_GERENCIAR'],
      ['/usuarios', 'USUARIOS_ADMINISTRAR'],
      ['/solicitacoes', 'SOLICITACOES_GERENCIAR'],
      ['/prestadores', 'CONTRATOS_GERENCIAR'],
    ];
    for (const [rota, permissao] of casos) {
      const sem = await request(app).get(rota).set(operador(TODAS_PERMISSOES.filter((p) => p !== permissao && !(tambem[rota] ?? []).includes(p))));
      expect([rota, 'sem', sem.status]).toEqual([rota, 'sem', 403]);
      const com = await request(app).get(rota).set(operador([permissao]));
      expect([rota, 'com', com.status === 403]).toEqual([rota, 'com', false]);
    }
  });

  it('operador sem nenhuma permissão não faz nada além da tela inicial', async () => {
    const nenhuma = operador([]);
    for (const rota of ['/atas', '/contratos', '/manutencoes', '/usuarios', '/relatorios/visao-geral']) {
      expect([rota, (await request(app).get(rota).set(nenhuma)).status]).toEqual([rota, 403]);
    }
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/dashboard/alertas').set(nenhuma)).status).toBe(200);
  });

  it('cada passo da manutenção exige a sua permissão (triar, avaliar, fiscalizar)', async () => {
    const passos: Array<[string, string]> = [
      ['aprovar', 'MANUTENCAO_TRIAR'],
      ['negar', 'MANUTENCAO_TRIAR'],
      ['confirmar-reencaminhamento', 'MANUTENCAO_TRIAR'],
      ['validar-orcamento', 'MANUTENCAO_AVALIAR'],
      ['reencaminhar/baixa', 'MANUTENCAO_AVALIAR'],
      ['solicitar-ajustes', 'MANUTENCAO_FISCALIZAR'],
      ['autorizar-medicao', 'MANUTENCAO_FISCALIZAR'],
      ['confirmar-retorno', 'MANUTENCAO_FISCALIZAR'],
    ];
    for (const [passo, permissao] of passos) {
      // Quem tem todas as outras, menos a do passo, é barrado antes de tocar no banco
      const sem = await request(app)
        .post(`/manutencoes/${UUID}/${passo}`)
        .set(operador(TODAS_PERMISSOES.filter((p) => p !== permissao)))
        .send({});
      expect([passo, sem.status]).toEqual([passo, 403]);
    }
  });

  it('abrir chamado exige "escrever"; "consultar" sozinho não abre', async () => {
    const res = await request(app).post('/manutencoes').set(operador(['MANUTENCAO_CONSULTAR'])).send({});
    expect(res.status).toBe(403);
  });

  it('Unidade e Galpão não dependem de permissão do Operador', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    prismaMock.ata.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/manutencoes').set(auth('UNIDADE', { unidadeId: 'u-1' }))).status).toBe(200);
    expect((await request(app).get('/atas').set(auth('GALPAO', { unidadeId: 'g-1' }))).status).toBe(200);
  });

  it('o token de uma sessão do Operador traz as permissões; token adulterado não concede o que não existe', async () => {
    const forjado = jwt.sign({ nome: 'X', perfil: 'OPERADOR', permissoes: ['VIRAR_ROOT'] }, 'segredo-de-teste', { subject: 'u1' });
    const res = await request(app).get('/atas').set('Authorization', `Bearer ${forjado}`);
    expect(res.status).toBe(403);
    // Perfis que não são Operador ignoram qualquer permissão que venha no token
    const unidade = jwt.sign({ nome: 'X', perfil: 'UNIDADE', unidadeId: 'u-1', permissoes: ['ATAS_GERENCIAR'] }, 'segredo-de-teste', { subject: 'u2' });
    expect((await request(app).get('/atas').set('Authorization', `Bearer ${unidade}`)).status).toBe(403);
  });
});

describe('Cadastro de usuário com permissões', () => {
  // O Operador que administra usuários é conferido no banco a cada pedido (o token vale 30 min)
  beforeEach(() => mockUsuarioFindFirst(prismaMock.usuario.findFirst));

  const existente = (sobre: Record<string, unknown> = {}) => ({
    id: 'u-1',
    nome: 'Operador Um',
    email: 'op@joinville.sc.gov.br',
    matricula: '1',
    perfil: 'OPERADOR',
    ativo: true,
    permissoes: ['USUARIOS_ADMINISTRAR', 'ATAS_GERENCIAR'],
    unidadeId: null,
    prestadorId: null,
    ...sobre,
  });

  it('grava as permissões do Operador e descarta as de outros perfis', async () => {
    mockUsuarioFindFirst(prismaMock.usuario.findFirst);
    prismaMock.usuario.create.mockResolvedValue({ id: 'novo' } as never);
    const op = await request(app)
      .post('/usuarios')
      .set(operador(['USUARIOS_ADMINISTRAR']))
      .send({ email: 'novo@joinville.sc.gov.br', perfil: 'OPERADOR', permissoes: ['ATAS_GERENCIAR', 'ATAS_GERENCIAR'] });
    expect(op.status).toBe(201);
    expect(prismaMock.usuario.create.mock.calls[0][0].data).toMatchObject({ permissoes: ['ATAS_GERENCIAR'] });

    const gal = await request(app)
      .post('/usuarios')
      .set(operador(['USUARIOS_ADMINISTRAR']))
      .send({ email: 'gal@joinville.sc.gov.br', perfil: 'GALPAO', unidadeId: UUID, permissoes: ['ATAS_GERENCIAR'] });
    expect(gal.status).toBe(201);
    expect(prismaMock.usuario.create.mock.calls[1][0].data).toMatchObject({ permissoes: [] });
  });

  it('recusa permissão fora do catálogo e quem não administra usuários', async () => {
    const invalida = await request(app)
      .post('/usuarios')
      .set(operador(['USUARIOS_ADMINISTRAR']))
      .send({ email: 'a@joinville.sc.gov.br', perfil: 'OPERADOR', permissoes: ['VIRAR_ROOT'] });
    expect(invalida.status).toBe(422);
    const semPermissao = await request(app)
      .patch('/usuarios/u-1')
      .set(operador(['ATAS_GERENCIAR']))
      .send({ permissoes: ['ATAS_GERENCIAR'] });
    expect(semPermissao.status).toBe(403);
  });

  it('atualiza as permissões e audita antes e depois', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(existente() as never);
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.update.mockResolvedValue(existente({ permissoes: ['USUARIOS_ADMINISTRAR'] }) as never);
    const res = await request(app)
      .patch('/usuarios/u-1')
      .set(operador(['USUARIOS_ADMINISTRAR']))
      .send({ permissoes: ['USUARIOS_ADMINISTRAR'] });
    expect(res.status).toBe(200);
    const log = prismaMock.logAuditoria.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ acao: 'ATUALIZAR_USUARIO' });
    expect(JSON.stringify(log.dadosAntes)).toContain('ATAS_GERENCIAR');
  });

  it('trava: não retira a administração de usuários do último operador que a tem', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(existente() as never);
    prismaMock.usuario.count.mockResolvedValue(0);
    const retirar = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ permissoes: ['ATAS_GERENCIAR'] });
    expect(retirar.status).toBe(422);
    const desativar = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ ativo: false });
    expect(desativar.status).toBe(422);
    const mudarPerfil = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ perfil: 'SEM_ACESSO' });
    expect(mudarPerfil.status).toBe(422);
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
  });

  it('com outro administrador ativo, a retirada é permitida', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(existente() as never);
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.update.mockResolvedValue(existente({ permissoes: ['ATAS_GERENCIAR'] }) as never);
    const res = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ permissoes: ['ATAS_GERENCIAR'] });
    expect(res.status).toBe(200);
  });

  it('mudar o perfil de Operador para outro zera as permissões', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(existente({ permissoes: ['ATAS_GERENCIAR'] }) as never);
    prismaMock.unidade.findFirst.mockResolvedValue(null);
    prismaMock.usuario.update.mockResolvedValue(existente({ perfil: 'GALPAO', permissoes: [] }) as never);
    const res = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ perfil: 'GALPAO', unidadeId: UUID });
    expect(res.status).toBe(200);
    expect(prismaMock.usuario.update.mock.calls[0][0].data).toMatchObject({ permissoes: [] });
  });

  it('quem perdeu a permissão ou foi desativado depois de logar não administra usuários, mesmo com o token antigo', async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    const res = await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ permissoes: ['USUARIOS_ADMINISTRAR'] });
    expect(res.status).toBe(403);
    expect(prismaMock.usuario.update).not.toHaveBeenCalled();
    expect((await request(app).get('/usuarios').set(operador(['USUARIOS_ADMINISTRAR']))).status).toBe(403);
    expect(prismaMock.usuario.findFirst.mock.calls[0][0]?.where).toMatchObject({ ativo: true, permissoes: { has: 'USUARIOS_ADMINISTRAR' } });
  });

  it('a conferência do último administrador trava os administradores e grava na mesma transação', async () => {
    prismaMock.usuario.findUnique.mockResolvedValue(existente() as never);
    prismaMock.usuario.count.mockResolvedValue(1);
    prismaMock.usuario.update.mockResolvedValue(existente({ permissoes: ['ATAS_GERENCIAR'] }) as never);
    await request(app).patch('/usuarios/u-1').set(operador(['USUARIOS_ADMINISTRAR'])).send({ permissoes: ['ATAS_GERENCIAR'] });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect((prismaMock.$queryRaw.mock.calls[0][0] as unknown as string[]).join(' ')).toContain('FOR UPDATE');
  });

  it('aguardar providências exige a permissão de triar', async () => {
    const semTriar = await request(app).post('/manutencoes/m-1/aguardar-providencias').set(operador(['MANUTENCAO_CONSULTAR'])).send({ motivo: 'sem contrato' });
    expect(semTriar.status).toBe(403);
  });
});
