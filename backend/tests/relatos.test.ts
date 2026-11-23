// Caminhos fixos do diretório de uploads de teste, nunca informados por usuário
/* eslint-disable security/detect-non-literal-fs-filename */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';
import { RELATOS_DIR } from '../src/lib/uploads';

const app = criarApp();

const ID = '11111111-1111-1111-1111-111111111111';
const corpo = {
  categoria: 'BUG',
  titulo: 'Tela travou ao salvar',
  tela: '/solicitacoes/nova',
  esperado: 'Salvar o pedido',
  aconteceu: 'A tela travou ao salvar',
  navegador: 'Chrome',
};
const atendente = (sub = 'atendente-1') => auth('OPERADOR', { sub, permissoes: ['SUPORTE_ATENDER'] });
const comum = (sub = 'autor-1') => auth('UNIDADE', { unidadeId: 'u1', sub });
const chamado = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  numero: 7,
  status: 'ABERTO',
  titulo: 'Tela travou ao salvar',
  usuario: { id: 'autor-1', nome: 'Rodrigo', email: 'r@x.gov' },
  ...extra,
});
const avisosCriados = () => prismaMock.avisoUsuario.createMany.mock.calls.map((c) => c[0] as { data: Array<{ usuarioId: string; tipo: string; mensagem: string; href: string }> });

describe('Chamado de suporte — abertura', () => {
  beforeEach(() => {
    prismaMock.relatoProblema.create.mockResolvedValue({ id: ID, numero: 7, titulo: corpo.titulo, status: 'ABERTO', criadoEm: new Date() } as never);
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 'atendente-1' }, { id: 'atendente-2' }] as never);
  });

  it.each([
    ['OPERADOR', {}],
    ['UNIDADE', { unidadeId: 'u1' }],
    ['GALPAO', {}],
    ['TERCEIRIZADA', { prestadorId: 'p1' }],
    ['SEM_ACESSO', {}],
  ] as const)('o perfil %s abre um chamado, e o perfil vai junto', async (perfil, opcoes) => {
    const res = await request(app).post('/relatos').set(auth(perfil, { ...opcoes, sub: `u-${perfil}` })).send(corpo);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numero: 7 });
    expect(prismaMock.relatoProblema.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usuarioId: `u-${perfil}`, perfil, categoria: 'BUG', titulo: corpo.titulo, tela: '/solicitacoes/nova' }),
      }),
    );
  });

  it('exige autenticação', async () => {
    expect((await request(app).post('/relatos').send(corpo)).status).toBe(401);
  });

  it('o usuário não escolhe o perfil nem o autor: vêm do token', async () => {
    await request(app).post('/relatos').set(comum('quem-sou')).send({ ...corpo, usuarioId: 'outra-pessoa', perfil: 'OPERADOR' });
    const dados = prismaMock.relatoProblema.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(dados.usuarioId).toBe('quem-sou');
    expect(dados.perfil).toBe('UNIDADE');
  });

  it.each(['BUG', 'MELHORIA', 'NOVA_FUNCIONALIDADE', 'DUVIDA', 'OUTRO'])('aceita a categoria %s; sem categoria vale BUG', async (categoria) => {
    expect((await request(app).post('/relatos').set(comum()).send({ ...corpo, categoria })).status).toBe(201);
    expect(prismaMock.relatoProblema.create.mock.calls.at(-1)![0].data).toMatchObject({ categoria });
    const semCategoria: Record<string, unknown> = { ...corpo };
    delete semCategoria.categoria;
    await request(app).post('/relatos').set(comum()).send(semCategoria);
    expect(prismaMock.relatoProblema.create.mock.calls.at(-1)![0].data).toMatchObject({ categoria: 'BUG' });
  });

  it('avisa, dentro do sistema, quem atende (menos o próprio autor) e sem o texto do chamado', async () => {
    await request(app).post('/relatos').set(auth('OPERADOR', { sub: 'atendente-1', permissoes: ['SUPORTE_ATENDER'] })).send(corpo);
    const [{ data }] = avisosCriados();
    expect(data.map((a) => a.usuarioId)).toEqual(['atendente-2']);
    expect(data[0]).toMatchObject({ tipo: 'CHAMADO_SUPORTE_NOVO', href: `/suporte/${ID}` });
    expect(JSON.stringify(data)).not.toContain(corpo.aconteceu);
    expect(prismaMock.usuario.findMany.mock.calls[0][0]).toMatchObject({ where: { ativo: true, perfil: 'OPERADOR', permissoes: { has: 'SUPORTE_ATENDER' } } });
  });

  it.each([
    ['sem título', { ...corpo, titulo: '' }],
    ['título curto demais', { ...corpo, titulo: 'ab' }],
    ['título gigante', { ...corpo, titulo: 'x'.repeat(81) }],
    ['categoria inventada', { ...corpo, categoria: 'OUTRA' }],
    ['sem descrição', { ...corpo, aconteceu: '' }],
    ['descrição curta demais', { ...corpo, aconteceu: 'ruim' }],
    ['tela que não é caminho do sistema', { ...corpo, tela: 'https://exemplo.com/x' }],
    ['descrição gigante', { ...corpo, aconteceu: 'x'.repeat(3001) }],
  ])('recusa %s', async (_nome, body) => {
    const res = await request(app).post('/relatos').set(comum()).send(body);
    expect(res.status).toBe(422);
    expect(prismaMock.relatoProblema.create).not.toHaveBeenCalled();
  });
});

describe('Chamado de suporte — quem vê o quê', () => {
  it('"meus chamados": qualquer perfil lista só os próprios', async () => {
    prismaMock.relatoProblema.findMany.mockResolvedValue([] as never);
    for (const [perfil, opcoes] of [['UNIDADE', { unidadeId: 'u1' }], ['GALPAO', {}], ['TERCEIRIZADA', { prestadorId: 'p1' }], ['SEM_ACESSO', {}], ['OPERADOR', {}]] as const) {
      prismaMock.relatoProblema.findMany.mockClear();
      const res = await request(app).get('/relatos/meus').set(auth(perfil, { ...opcoes, sub: `eu-${perfil}` }));
      expect(res.status).toBe(200);
      expect(prismaMock.relatoProblema.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { usuarioId: `eu-${perfil}` } }));
    }
  });

  it('a lista geral é só do atendimento: administrar usuários, sozinho, não basta', async () => {
    prismaMock.relatoProblema.findMany.mockResolvedValue([chamado()] as never);
    expect((await request(app).get('/relatos').set(atendente())).status).toBe(200);
    expect((await request(app).get('/relatos').set(auth('OPERADOR', { permissoes: ['USUARIOS_ADMINISTRAR'] }))).status).toBe(403);
    expect((await request(app).get('/relatos').set(auth('OPERADOR', { permissoes: ['ATAS_GERENCIAR'] }))).status).toBe(403);
    expect((await request(app).get('/relatos').set(comum())).status).toBe(403);
    expect((await request(app).get('/relatos').set(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
    expect((await request(app).get('/relatos').set(auth('SEM_ACESSO'))).status).toBe(403);
  });

  it('filtra a lista geral por status e categoria e recusa valores inventados', async () => {
    prismaMock.relatoProblema.findMany.mockResolvedValue([] as never);
    await request(app).get('/relatos?status=AGUARDANDO_RETORNO&categoria=MELHORIA').set(atendente());
    expect(prismaMock.relatoProblema.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'AGUARDANDO_RETORNO', categoria: 'MELHORIA' } }));
    expect((await request(app).get('/relatos?status=QUALQUER').set(atendente())).status).toBe(422);
    expect((await request(app).get('/relatos?categoria=QUALQUER').set(atendente())).status).toBe(422);
    // nomes herdados do objeto também são inventados
    expect((await request(app).get('/relatos?status=toString').set(atendente())).status).toBe(422);
    expect((await request(app).get('/relatos?categoria=constructor').set(atendente())).status).toBe(422);
  });

  it('o detalhe é do autor e do atendimento; qualquer outra pessoa recebe 404', async () => {
    prismaMock.relatoProblema.findUnique.mockResolvedValue(chamado() as never);
    expect((await request(app).get(`/relatos/${ID}`).set(comum('autor-1'))).status).toBe(200);
    expect((await request(app).get(`/relatos/${ID}`).set(atendente())).status).toBe(200);
    expect((await request(app).get(`/relatos/${ID}`).set(comum('outra-pessoa'))).status).toBe(404);
    expect((await request(app).get(`/relatos/${ID}`).set(auth('OPERADOR', { sub: 'outro-op', permissoes: ['USUARIOS_ADMINISTRAR'] }))).status).toBe(404);
    expect((await request(app).get(`/relatos/${ID}`).set(auth('TERCEIRIZADA', { sub: 'autor-1', prestadorId: 'p1' }))).status).toBe(200);
    prismaMock.relatoProblema.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`/relatos/${ID}`).set(atendente())).status).toBe(404);
    expect((await request(app).get('/relatos/nao-e-id').set(atendente())).status).toBe(404);
  });
});

describe('Chamado de suporte — status', () => {
  const trocar = (status: string, token = atendente('adm')) => request(app).patch(`/relatos/${ID}/status`).set(token).send({ status });

  it('só o atendimento altera o status, e audita antes e depois', async () => {
    prismaMock.relatoProblema.findUnique
      .mockResolvedValueOnce({ status: 'EM_ANALISE', numero: 7, usuarioId: 'autor-1' } as never)
      .mockResolvedValueOnce(chamado({ status: 'AGUARDANDO_RETORNO' }) as never);
    prismaMock.relatoProblema.updateMany.mockResolvedValue({ count: 1 } as never);
    const res = await trocar('AGUARDANDO_RETORNO');
    expect(res.status).toBe(200);
    expect(prismaMock.relatoProblema.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: ID, status: 'EM_ANALISE' }, data: { status: 'AGUARDANDO_RETORNO', resolvidoEm: null } });
    expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'ALTERAR_STATUS_RELATO', usuarioId: 'adm', entidadeId: ID }) }),
    );
    // quem abriu é avisado, dentro do sistema
    const [{ data }] = avisosCriados();
    expect(data[0]).toMatchObject({ usuarioId: 'autor-1', tipo: 'CHAMADO_SUPORTE_STATUS', href: `/suporte/${ID}` });
  });

  it('quem abriu o chamado, outro operador e os demais perfis não alteram o status', async () => {
    expect((await trocar('RESOLVIDO', comum('autor-1'))).status).toBe(403);
    expect((await trocar('RESOLVIDO', auth('OPERADOR', { permissoes: ['USUARIOS_ADMINISTRAR'] }))).status).toBe(403);
    expect((await trocar('RESOLVIDO', auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
    expect((await trocar('RESOLVIDO', auth('SEM_ACESSO'))).status).toBe(403);
    expect(prismaMock.relatoProblema.updateMany).not.toHaveBeenCalled();
  });

  it('resolver guarda a data; reabrir (só o atendimento) a apaga e audita como reabertura', async () => {
    prismaMock.relatoProblema.findUnique
      .mockResolvedValueOnce({ status: 'EM_ANALISE', numero: 7, usuarioId: 'autor-1' } as never)
      .mockResolvedValueOnce(chamado({ status: 'RESOLVIDO' }) as never);
    prismaMock.relatoProblema.updateMany.mockResolvedValue({ count: 1 } as never);
    await trocar('RESOLVIDO');
    expect((prismaMock.relatoProblema.updateMany.mock.calls[0][0].data as { resolvidoEm: Date }).resolvidoEm).toBeInstanceOf(Date);

    prismaMock.relatoProblema.findUnique
      .mockResolvedValueOnce({ status: 'RESOLVIDO', numero: 7, usuarioId: 'autor-1' } as never)
      .mockResolvedValueOnce(chamado({ status: 'EM_ANALISE' }) as never);
    prismaMock.logAuditoria.create.mockClear();
    const res = await trocar('EM_ANALISE');
    expect(res.status).toBe(200);
    expect(prismaMock.relatoProblema.updateMany.mock.calls[1][0]).toMatchObject({ data: { status: 'EM_ANALISE', resolvidoEm: null } });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'REABRIR_RELATO' });
  });

  it('recusa status inválido, o mesmo status, chamado inexistente e decisão que mudou no meio', async () => {
    expect((await trocar('XPTO')).status).toBe(422);
    prismaMock.relatoProblema.findUnique.mockResolvedValueOnce({ status: 'ABERTO', numero: 7, usuarioId: 'autor-1' } as never);
    expect((await trocar('ABERTO')).status).toBe(422);
    prismaMock.relatoProblema.findUnique.mockResolvedValueOnce(null);
    expect((await trocar('RESOLVIDO')).status).toBe(404);
    prismaMock.relatoProblema.findUnique.mockResolvedValueOnce({ status: 'ABERTO', numero: 7, usuarioId: 'autor-1' } as never);
    prismaMock.relatoProblema.updateMany.mockResolvedValue({ count: 0 } as never);
    expect((await trocar('RESOLVIDO')).status).toBe(409);
  });
});

describe('Chamado de suporte — conversa', () => {
  const msg = { id: 'm1', texto: 'Já estamos olhando', criadoEm: new Date(), autor: { id: 'atendente-1', nome: 'Carla', perfil: 'OPERADOR' } };
  const enviar = (texto: string, token: Record<string, string>) => request(app).post(`/relatos/${ID}/mensagens`).set(token).send({ texto });

  beforeEach(() => {
    prismaMock.relatoProblema.findUnique.mockResolvedValue(chamado() as never);
    prismaMock.mensagemRelato.create.mockResolvedValue(msg as never);
    prismaMock.relatoProblema.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 'atendente-1' }, { id: 'atendente-2' }] as never);
    prismaMock.mensagemRelato.findMany.mockResolvedValue([] as never);
  });

  it('só quem abriu e o atendimento leem a conversa; os demais recebem 404', async () => {
    expect((await request(app).get(`/relatos/${ID}/mensagens`).set(comum('autor-1'))).status).toBe(200);
    expect((await request(app).get(`/relatos/${ID}/mensagens`).set(atendente())).status).toBe(200);
    expect((await request(app).get(`/relatos/${ID}/mensagens`).set(comum('outra-pessoa'))).status).toBe(404);
    expect((await request(app).get(`/relatos/${ID}/mensagens`).set(auth('OPERADOR', { permissoes: ['USUARIOS_ADMINISTRAR'] }))).status).toBe(404);
    expect((await request(app).get(`/relatos/${ID}/mensagens?depois=ontem`).set(atendente())).status).toBe(422);
  });

  it('o atendimento responde: o chamado sai de "Aberto" e quem abriu recebe um aviso sem o texto', async () => {
    const res = await enviar('Já estamos olhando', atendente('atendente-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.mensagemRelato.create.mock.calls[0][0].data).toMatchObject({ relatoId: ID, autorId: 'atendente-1', texto: 'Já estamos olhando' });
    expect(prismaMock.relatoProblema.updateMany).toHaveBeenCalledWith({ where: { id: ID, status: 'ABERTO' }, data: { status: 'EM_ANALISE' } });
    const [{ data }] = avisosCriados();
    expect(data[0]).toMatchObject({ usuarioId: 'autor-1', tipo: 'CHAMADO_SUPORTE_MENSAGEM', href: `/suporte/${ID}` });
    expect(JSON.stringify(data)).not.toContain('Já estamos olhando');
  });

  it('quem abriu responde: "Aguardando retorno" volta para "Em análise" e avisa quem já respondeu', async () => {
    prismaMock.relatoProblema.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_RETORNO' }) as never);
    prismaMock.mensagemRelato.findMany.mockResolvedValue([{ autorId: 'atendente-2' }] as never);
    const res = await enviar('Segue o print', comum('autor-1'));
    expect(res.status).toBe(201);
    expect(prismaMock.relatoProblema.updateMany).toHaveBeenCalledWith({ where: { id: ID, status: 'AGUARDANDO_RETORNO' }, data: { status: 'EM_ANALISE' } });
    const [{ data }] = avisosCriados();
    expect(data.map((a) => a.usuarioId)).toEqual(['atendente-2']);
  });

  it('se ninguém do atendimento respondeu ainda, a mensagem de quem abriu avisa todos os atendentes', async () => {
    await enviar('Alguém pode ver?', comum('autor-1'));
    const [{ data }] = avisosCriados();
    expect(data.map((a) => a.usuarioId).sort()).toEqual(['atendente-1', 'atendente-2']);
  });

  it('não escreve no chamado de outra pessoa nem como terceiro sem permissão', async () => {
    expect((await enviar('oi', comum('outra-pessoa'))).status).toBe(404);
    expect((await enviar('oi', auth('OPERADOR', { sub: 'op', permissoes: ['USUARIOS_ADMINISTRAR'] }))).status).toBe(404);
    expect(prismaMock.mensagemRelato.create).not.toHaveBeenCalled();
  });

  it('chamado resolvido não recebe mensagens até ser reaberto', async () => {
    prismaMock.relatoProblema.findUnique.mockResolvedValue(chamado({ status: 'RESOLVIDO' }) as never);
    expect((await enviar('Voltou a dar erro', comum('autor-1'))).status).toBe(422);
    expect((await enviar('Reabrindo', atendente())).status).toBe(422);
    expect(prismaMock.mensagemRelato.create).not.toHaveBeenCalled();
  });

  it('recusa mensagem vazia ou longa demais', async () => {
    expect((await enviar('   ', comum('autor-1'))).status).toBe(422);
    expect((await enviar('x'.repeat(2001), comum('autor-1'))).status).toBe(422);
    expect(prismaMock.mensagemRelato.create).not.toHaveBeenCalled();
  });
});

describe('Relatar problema — anexos', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const gravados: string[] = [];

  beforeEach(() => {
    prismaMock.relatoProblema.create.mockResolvedValue({ id: 'r1', numero: 1, titulo: 'T', status: 'ABERTO', criadoEm: new Date() } as never);
  });
  afterEach(() => {
    while (gravados.length) fs.rmSync(path.join(RELATOS_DIR, gravados.pop()!), { force: true });
  });

  function lembrar() {
    const chamadas = prismaMock.relatoProblema.create.mock.calls;
    const anexos = (chamadas[chamadas.length - 1]?.[0].data as { anexos?: string[] } | undefined)?.anexos ?? [];
    gravados.push(...anexos.map((a) => path.basename(a)));
    return anexos;
  }

  it('guarda os anexos enviados junto com o texto', async () => {
    const res = await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1' }))
      .field('titulo', 'Tela em branco')
      .field('tela', '/estoque')
      .field('aconteceu', 'A tela ficou em branco')
      .attach('anexos', PNG, { filename: 'print.png', contentType: 'image/png' });
    const anexos = lembrar();
    expect(res.status).toBe(201);
    expect(anexos).toHaveLength(1);
    expect(anexos[0]).toMatch(/^\/uploads\/relatos\/[0-9a-f-]{36}\.png$/);
    expect(fs.existsSync(path.join(RELATOS_DIR, path.basename(anexos[0])))).toBe(true);
  });

  it('descarta o arquivo cujo conteúdo não é o que diz ser', async () => {
    const res = await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1' }))
      .field('titulo', 'Texto qualquer')
      .field('tela', '/estoque')
      .field('aconteceu', 'Texto qualquer')
      .attach('anexos', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(prismaMock.relatoProblema.create).not.toHaveBeenCalled();
  });

  it('recusa mais de 3 anexos e formato não suportado', async () => {
    let req = request(app).post('/relatos').set(auth('UNIDADE', { unidadeId: 'u1' })).field('titulo', 'Muitos anexos').field('tela', '/x').field('aconteceu', 'Texto qualquer');
    for (let i = 0; i < 4; i++) req = req.attach('anexos', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
    expect((await req).status).toBe(422);

    const exe = await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1' }))
      .field('titulo', 'Formato ruim')
      .field('tela', '/x')
      .field('aconteceu', 'Texto qualquer')
      .attach('anexos', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(422);
    expect(prismaMock.relatoProblema.create).not.toHaveBeenCalled();
  });

  it('não deixa o anexo órfão no disco quando os dados são inválidos', async () => {
    const antes = fs.readdirSync(RELATOS_DIR).length;
    const res = await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1' }))
      .field('titulo', 'Dados ruins')
      .field('tela', '/x')
      .field('aconteceu', 'ruim')
      .attach('anexos', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(fs.readdirSync(RELATOS_DIR).length).toBe(antes);
  });

  describe('download', () => {
    const nome = '11111111-2222-3333-4444-555555555555.png';
    beforeEach(() => {
      fs.writeFileSync(path.join(RELATOS_DIR, nome), PNG);
      gravados.push(nome);
    });

    it('o atendimento abre o anexo de qualquer chamado', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue({ id: 'r1' } as never);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(atendente())).status).toBe(200);
      // para o atendimento a busca não se limita a um autor
      expect(prismaMock.relatoProblema.findFirst.mock.calls[0][0]).toMatchObject({ where: { anexos: { has: `/uploads/relatos/${nome}` } } });
      expect((prismaMock.relatoProblema.findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where).not.toHaveProperty('usuarioId');
    });

    it('quem abriu o chamado abre o próprio anexo, de qualquer perfil; a busca fica presa ao autor', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue({ id: 'r1' } as never);
      for (const token of [comum('autor-1'), auth('TERCEIRIZADA', { sub: 'autor-1', prestadorId: 'p1' }), auth('OPERADOR', { sub: 'autor-1', permissoes: ['USUARIOS_ADMINISTRAR'] })]) {
        prismaMock.relatoProblema.findFirst.mockClear();
        expect((await request(app).get(`/uploads/relatos/${nome}`).set(token)).status).toBe(200);
        expect(prismaMock.relatoProblema.findFirst.mock.calls[0][0]).toMatchObject({ where: { usuarioId: 'autor-1' } });
      }
    });

    it('o anexo de outra pessoa dá o mesmo 404 de um arquivo inexistente', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue(null);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(comum('outra-pessoa'))).status).toBe(404);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('OPERADOR', { permissoes: ['ATAS_GERENCIAR'] }))).status).toBe(404);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(atendente())).status).toBe(404);
      expect((await request(app).get('/uploads/relatos/..%2Fsegredo.png').set(atendente())).status).toBe(404);
    });
  });
});
