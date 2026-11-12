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

const corpo = { tela: '/solicitacoes/nova', esperado: 'Salvar o pedido', aconteceu: 'A tela travou ao salvar', navegador: 'Chrome' };

describe('Relatar problema — envio', () => {
  beforeEach(() => {
    prismaMock.relatoProblema.create.mockResolvedValue({ id: 'r1', status: 'ABERTO', criadoEm: new Date() } as never);
  });

  it.each([
    ['OPERADOR', {}],
    ['UNIDADE', { unidadeId: 'u1' }],
    ['GALPAO', {}],
    ['TERCEIRIZADA', { prestadorId: 'p1' }],
    ['SEM_ACESSO', {}],
  ] as const)('o perfil %s consegue relatar, e o perfil vai junto', async (perfil, opcoes) => {
    const res = await request(app).post('/relatos').set(auth(perfil, { ...opcoes, sub: `u-${perfil}` })).send(corpo);
    expect(res.status).toBe(201);
    expect(prismaMock.relatoProblema.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usuarioId: `u-${perfil}`, perfil, tela: '/solicitacoes/nova', aconteceu: 'A tela travou ao salvar' }),
      }),
    );
  });

  it('exige autenticação', async () => {
    expect((await request(app).post('/relatos').send(corpo)).status).toBe(401);
  });

  it('o usuário não escolhe o perfil nem o autor: vêm do token', async () => {
    await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1', sub: 'quem-sou' }))
      .send({ ...corpo, usuarioId: 'outra-pessoa', perfil: 'OPERADOR' });
    const dados = prismaMock.relatoProblema.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(dados.usuarioId).toBe('quem-sou');
    expect(dados.perfil).toBe('UNIDADE');
  });

  it.each([
    ['sem descrição', { ...corpo, aconteceu: '' }],
    ['descrição curta demais', { ...corpo, aconteceu: 'ruim' }],
    ['tela que não é caminho do sistema', { ...corpo, tela: 'https://exemplo.com/x' }],
    ['descrição gigante', { ...corpo, aconteceu: 'x'.repeat(3001) }],
  ])('recusa %s', async (_nome, body) => {
    const res = await request(app).post('/relatos').set(auth('UNIDADE', { unidadeId: 'u1' })).send(body);
    expect(res.status).toBe(422);
    expect(prismaMock.relatoProblema.create).not.toHaveBeenCalled();
  });
});

describe('Relatar problema — leitura e triagem', () => {
  const relato = { id: '11111111-1111-1111-1111-111111111111', status: 'ABERTO' };

  it('lista só para quem administra usuários', async () => {
    prismaMock.relatoProblema.findMany.mockResolvedValue([relato] as never);
    expect((await request(app).get('/relatos').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).get('/relatos').set(auth('OPERADOR', { permissoes: ['ATAS_GERENCIAR'] }))).status).toBe(403);
    expect((await request(app).get('/relatos').set(auth('UNIDADE', { unidadeId: 'u1' }))).status).toBe(403);
    expect((await request(app).get('/relatos').set(auth('GALPAO'))).status).toBe(403);
  });

  it('a terceirizada e quem está sem acesso só enviam: não leem nem alteram', async () => {
    for (const perfil of ['TERCEIRIZADA', 'SEM_ACESSO'] as const) {
      const h = auth(perfil, { prestadorId: 'p1' });
      expect((await request(app).get('/relatos').set(h)).status).toBe(403);
      expect((await request(app).get(`/relatos/${relato.id}`).set(h)).status).toBe(403);
      expect((await request(app).patch(`/relatos/${relato.id}/status`).set(h).send({ status: 'RESOLVIDO' })).status).toBe(403);
    }
  });

  it('filtra por status e recusa status inventado', async () => {
    prismaMock.relatoProblema.findMany.mockResolvedValue([] as never);
    await request(app).get('/relatos?status=EM_ANALISE').set(auth('OPERADOR'));
    expect(prismaMock.relatoProblema.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'EM_ANALISE' } }));
    expect((await request(app).get('/relatos?status=QUALQUER').set(auth('OPERADOR'))).status).toBe(422);
  });

  it('devolve um relato e 404 quando não existe', async () => {
    prismaMock.relatoProblema.findUnique.mockResolvedValueOnce(relato as never);
    expect((await request(app).get(`/relatos/${relato.id}`).set(auth('OPERADOR'))).status).toBe(200);
    prismaMock.relatoProblema.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get(`/relatos/${relato.id}`).set(auth('OPERADOR'))).status).toBe(404);
    expect((await request(app).get('/relatos/nao-e-id').set(auth('OPERADOR'))).status).toBe(404);
  });

  it('altera o status e audita antes e depois', async () => {
    prismaMock.relatoProblema.findUnique.mockResolvedValue({ status: 'ABERTO' } as never);
    prismaMock.relatoProblema.update.mockResolvedValue({ ...relato, status: 'RESOLVIDO' } as never);
    const res = await request(app).patch(`/relatos/${relato.id}/status`).set(auth('OPERADOR', { sub: 'adm' })).send({ status: 'RESOLVIDO' });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'ALTERAR_STATUS_RELATO', usuarioId: 'adm', entidadeId: relato.id }),
      }),
    );
  });

  it('recusa status inválido e relato inexistente', async () => {
    expect((await request(app).patch(`/relatos/${relato.id}/status`).set(auth('OPERADOR')).send({ status: 'XPTO' })).status).toBe(422);
    prismaMock.relatoProblema.findUnique.mockResolvedValue(null);
    expect((await request(app).patch(`/relatos/${relato.id}/status`).set(auth('OPERADOR')).send({ status: 'RESOLVIDO' })).status).toBe(404);
  });
});

describe('Relatar problema — anexos', () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const gravados: string[] = [];

  beforeEach(() => {
    prismaMock.relatoProblema.create.mockResolvedValue({ id: 'r1', status: 'ABERTO', criadoEm: new Date() } as never);
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
      .field('tela', '/estoque')
      .field('aconteceu', 'Texto qualquer')
      .attach('anexos', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
    expect(prismaMock.relatoProblema.create).not.toHaveBeenCalled();
  });

  it('recusa mais de 3 anexos e formato não suportado', async () => {
    let req = request(app).post('/relatos').set(auth('UNIDADE', { unidadeId: 'u1' })).field('tela', '/x').field('aconteceu', 'Texto qualquer');
    for (let i = 0; i < 4; i++) req = req.attach('anexos', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
    expect((await req).status).toBe(422);

    const exe = await request(app)
      .post('/relatos')
      .set(auth('UNIDADE', { unidadeId: 'u1' }))
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

    it('o Administrador abre o anexo de um relato', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue({ id: 'r1' } as never);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('OPERADOR'))).status).toBe(200);
    });

    it('quem não administra usuários não abre, nem o autor de outro perfil', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue({ id: 'r1' } as never);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('UNIDADE', { unidadeId: 'u1' }))).status).toBe(403);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('OPERADOR', { permissoes: ['ATAS_GERENCIAR'] }))).status).toBe(403);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
    });

    it('arquivo que não pertence a nenhum relato e nome fora do padrão dão 404', async () => {
      prismaMock.relatoProblema.findFirst.mockResolvedValue(null);
      expect((await request(app).get(`/uploads/relatos/${nome}`).set(auth('OPERADOR'))).status).toBe(404);
      expect((await request(app).get('/uploads/relatos/..%2Fsegredo.png').set(auth('OPERADOR'))).status).toBe(404);
    });
  });
});
