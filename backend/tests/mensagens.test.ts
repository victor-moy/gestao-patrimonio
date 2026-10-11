import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const ID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';

const solicitacao = {
  unidadeOrigemId: 'unidade-1',
  unidadeDestinoId: null,
  unidadeOrigem: { emailBase: 'sul@joinville.sc.gov.br' },
};
const manutencao = { unidadeId: 'unidade-1', unidade: { emailBase: 'sul@joinville.sc.gov.br' } };
const mensagem = {
  id: 'm1',
  texto: 'Bom dia',
  criadoEm: new Date('2026-10-10T10:00:00Z'),
  autor: { id: 'user-1', nome: 'Ana', perfil: 'UNIDADE' },
};

describe('Chat da solicitação', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get(`/solicitacoes/${ID}/mensagens`);
    expect(res.status).toBe(401);
  });

  it('a unidade da solicitação lista as mensagens em ordem cronológica', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    prismaMock.mensagemChat.findMany.mockResolvedValue([mensagem] as never);
    const res = await request(app)
      .get(`/solicitacoes/${ID}/mensagens`)
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.mensagemChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { solicitacaoId: ID }, orderBy: { criadoEm: 'asc' } }),
    );
  });

  it('filtra por "depois" para buscar só as novas', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    prismaMock.mensagemChat.findMany.mockResolvedValue([]);
    await request(app)
      .get(`/solicitacoes/${ID}/mensagens?depois=2026-10-10T10:00:00.000Z`)
      .set(auth('GESTOR_PATRIMONIO'));
    expect(prismaMock.mensagemChat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { solicitacaoId: ID, criadoEm: { gt: new Date('2026-10-10T10:00:00.000Z') } },
      }),
    );
  });

  it('rejeita "depois" inválido', async () => {
    const res = await request(app).get(`/solicitacoes/${ID}/mensagens?depois=ontem`).set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(422);
  });

  it('Unidade de outra unidade não lê nem escreve', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    const leitura = await request(app).get(`/solicitacoes/${ID}/mensagens`).set(auth('UNIDADE', { unidadeId: 'outra' }));
    expect(leitura.status).toBe(403);
    const escrita = await request(app)
      .post(`/solicitacoes/${ID}/mensagens`)
      .set(auth('UNIDADE', { unidadeId: 'outra' }))
      .send({ texto: 'oi' });
    expect(escrita.status).toBe(403);
    expect(prismaMock.mensagemChat.create).not.toHaveBeenCalled();
  });

  it('Gestor de Manutenção não participa de conversas de solicitação', async () => {
    const res = await request(app).get(`/solicitacoes/${ID}/mensagens`).set(auth('GESTOR_MANUTENCAO'));
    expect(res.status).toBe(403);
  });

  it('solicitação inexistente retorna 404', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(null);
    const res = await request(app).get(`/solicitacoes/${ID}/mensagens`).set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(404);
  });

  it('envia mensagem (texto aparado) e grava o autor do token', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    prismaMock.mensagemChat.create.mockResolvedValue(mensagem as never);
    const res = await request(app)
      .post(`/solicitacoes/${ID}/mensagens`)
      .set(auth('UNIDADE', { unidadeId: 'unidade-1', sub: 'user-9' }))
      .send({ texto: '  Bom dia  ' });
    expect(res.status).toBe(201);
    expect(prismaMock.mensagemChat.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { solicitacaoId: ID, autorId: 'user-9', texto: 'Bom dia' } }),
    );
    // mensagem da própria unidade não dispara e-mail
    expect(prismaMock.notificacao.create).not.toHaveBeenCalled();
  });

  it('mensagem do Gestor avisa a unidade por e-mail, sem o conteúdo', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    prismaMock.mensagemChat.create.mockResolvedValue(mensagem as never);
    await request(app)
      .post(`/solicitacoes/${ID}/mensagens`)
      .set(auth('GESTOR_PATRIMONIO', { nome: 'Samuel' }))
      .send({ texto: 'Segredo do conteúdo' });
    const dados = (prismaMock.notificacao.create.mock.calls[0][0] as { data: { corpo: string; destinatario: string } }).data;
    expect(dados.destinatario).toBe('sul@joinville.sc.gov.br');
    expect(dados.corpo).toContain('Samuel');
    expect(dados.corpo).not.toContain('Segredo');
  });

  it.each([
    ['vazia', '   '],
    ['longa demais', 'a'.repeat(2001)],
  ])('recusa mensagem %s', async (_nome, texto) => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    const res = await request(app).post(`/solicitacoes/${ID}/mensagens`).set(auth('GESTOR_PATRIMONIO')).send({ texto });
    expect(res.status).toBe(422);
    expect(prismaMock.mensagemChat.create).not.toHaveBeenCalled();
  });
});

describe('Chat da manutenção', () => {
  it('Gestor de Manutenção participa e grava no contexto da manutenção', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencao as never);
    prismaMock.mensagemChat.create.mockResolvedValue(mensagem as never);
    const res = await request(app)
      .post(`/manutencoes/${ID}/mensagens`)
      .set(auth('GESTOR_MANUTENCAO', { sub: 'gm-1' }))
      .send({ texto: 'Orçamento chegou' });
    expect(res.status).toBe(201);
    expect(prismaMock.mensagemChat.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { manutencaoId: ID, autorId: 'gm-1', texto: 'Orçamento chegou' } }),
    );
  });

  it('Unidade só acessa a manutenção da própria unidade', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencao as never);
    const res = await request(app).get(`/manutencoes/${ID}/mensagens`).set(auth('UNIDADE', { unidadeId: 'outra' }));
    expect(res.status).toBe(403);
  });

  it('Galpão não participa de conversas de manutenção', async () => {
    const res = await request(app).get(`/manutencoes/${ID}/mensagens`).set(auth('GALPAO', { unidadeId: 'g1' }));
    expect(res.status).toBe(403);
  });
});

describe('Lista de conversas', () => {
  const ultima = (texto: string, em: string) => [{ texto, criadoEm: new Date(em), autor: { nome: 'Ana' } }];

  it('junta solicitações e manutenções com mensagens, da mais recente para a mais antiga', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      {
        id: 's1',
        tipo: 'AMPLIACAO',
        unidadeOrigem: { nome: 'UBS Norte' },
        equipamento: null,
        tipoEquipamento: { nome: 'Autoclave' },
        mensagens: ultima('antiga', '2026-10-09T10:00:00Z'),
      },
    ] as never);
    prismaMock.manutencao.findMany.mockResolvedValue([
      { id: 'm1', unidade: { nome: 'UBS Norte' }, equipamento: { descricao: 'Microscópio' }, mensagens: ultima('recente', '2026-10-10T10:00:00Z') },
    ] as never);
    const res = await request(app).get('/conversas').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual(['m1', 's1']);
    expect(res.body[1]).toMatchObject({ contexto: 'solicitacao', tipoSolicitacao: 'AMPLIACAO', item: 'Autoclave', ultimoTexto: 'antiga' });
  });

  it('Unidade só enxerga conversas da própria unidade', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/conversas').set(auth('UNIDADE', { unidadeId: 'un-1' }));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mensagens: { some: {} }, OR: [{ unidadeOrigemId: 'un-1' }, { unidadeDestinoId: 'un-1' }] },
      }),
    );
    expect(prismaMock.manutencao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mensagens: { some: {} }, unidadeId: 'un-1' } }),
    );
  });

  it('Galpão vê só solicitações; Gestor de Manutenção só manutenções', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/conversas').set(auth('GALPAO', { unidadeId: 'g1' }));
    expect(prismaMock.manutencao.findMany).not.toHaveBeenCalled();
    prismaMock.solicitacao.findMany.mockClear();
    await request(app).get('/conversas').set(auth('GESTOR_MANUTENCAO'));
    expect(prismaMock.solicitacao.findMany).not.toHaveBeenCalled();
  });

  it('exige autenticação', async () => {
    expect((await request(app).get('/conversas')).status).toBe(401);
  });
});

describe('Mensagens não lidas', () => {
  const ultima = [{ texto: 'oi', criadoEm: new Date('2026-10-10T10:00:00Z'), autor: { nome: 'Ana' } }];
  const solicitacaoLista = { id: 's1', numero: 1, tipo: 'AMPLIACAO', unidadeOrigem: { nome: 'UBS' }, equipamento: null, tipoEquipamento: { nome: 'Autoclave' }, mensagens: ultima };

  it('a lista traz quantas mensagens de outras pessoas ainda não foram lidas em cada conversa', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([solicitacaoLista] as never);
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ id: 's1', n: 3 }]);
    const res = await request(app).get('/conversas').set(auth('UNIDADE', { unidadeId: 'un-1' }));
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: 's1', naoLidas: 3 });
  });

  it('Gestor de Patrimônio só lista solicitações em que está envolvido, mais a fila de pendentes sem decisão', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/conversas').set(auth('GESTOR_PATRIMONIO', { sub: 'gp-1' }));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mensagens: { some: {} },
          OR: [
            { mensagens: { some: { autorId: 'gp-1' } } },
            { criadoPorId: 'gp-1' },
            { decididoPorId: 'gp-1' },
            { status: 'PENDENTE_APROVACAO', decididoPorId: null },
          ],
        },
      }),
    );
    // nas manutenções o Gestor de Patrimônio não tem fila: só o que fez parte
    const where = (prismaMock.manutencao.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toEqual([
      { mensagens: { some: { autorId: 'gp-1' } } },
      { solicitanteId: 'gp-1' },
      { decididoPorId: 'gp-1' },
    ]);
  });

  it('Gestor de Manutenção tem a fila das manutenções pendentes e o mesmo filtro de envolvimento', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/conversas').set(auth('GESTOR_MANUTENCAO', { sub: 'gm-1' }));
    expect(prismaMock.manutencao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mensagens: { some: {} },
          OR: [
            { mensagens: { some: { autorId: 'gm-1' } } },
            { solicitanteId: 'gm-1' },
            { decididoPorId: 'gm-1' },
            { status: 'PENDENTE_APROVACAO', decididoPorId: null },
          ],
        },
      }),
    );
  });

  it('Galpão segue vendo as solicitações sem filtro de envolvimento', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([]);
    await request(app).get('/conversas').set(auth('GALPAO', { unidadeId: 'g1' }));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mensagens: { some: {} } } }));
  });

  it('o total de não lidas soma só as conversas que o usuário enxerga', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }] as never);
    prismaMock.manutencao.findMany.mockResolvedValue([{ id: 'm1' }] as never);
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValueOnce([{ id: 's1', n: 2 }]).mockResolvedValueOnce([{ id: 'm1', n: 5 }]);
    const res = await request(app).get('/conversas/nao-lidas').set(auth('UNIDADE', { unidadeId: 'un-1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 7, conversas: 2 });
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mensagens: { some: {} }, OR: [{ unidadeOrigemId: 'un-1' }, { unidadeDestinoId: 'un-1' }] } }),
    );
  });

  it('o total exige autenticação', async () => {
    expect((await request(app).get('/conversas/nao-lidas')).status).toBe(401);
  });

  it('marca a conversa como lida com o id do token e responde 204', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    const res = await request(app)
      .post(`/solicitacoes/${ID}/mensagens/lida`)
      .set(auth('UNIDADE', { unidadeId: 'unidade-1', sub: 'user-9' }))
      .send({ ate: '2026-10-10T10:00:00.000Z' });
    expect(res.status).toBe(204);
    const sql = (prismaMock.$executeRaw as jest.Mock).mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toEqual(expect.arrayContaining(['user-9', ID, new Date('2026-10-10T10:00:00.000Z')]));
  });

  it('uma data no futuro é limitada ao momento atual', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencao as never);
    const antes = Date.now();
    await request(app)
      .post(`/manutencoes/${ID}/mensagens/lida`)
      .set(auth('GESTOR_MANUTENCAO'))
      .send({ ate: '2999-01-01T00:00:00.000Z' });
    const data = ((prismaMock.$executeRaw as jest.Mock).mock.calls[0][0] as { values: unknown[] }).values.find((v) => v instanceof Date) as Date;
    expect(data.getTime()).toBeGreaterThanOrEqual(antes);
    expect(data.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('Unidade de outra unidade não marca leitura, e perfil fora da conversa também não', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacao as never);
    const outra = await request(app)
      .post(`/solicitacoes/${ID}/mensagens/lida`)
      .set(auth('UNIDADE', { unidadeId: 'outra' }))
      .send({ ate: '2026-10-10T10:00:00.000Z' });
    expect(outra.status).toBe(403);
    const perfil = await request(app)
      .post(`/solicitacoes/${ID}/mensagens/lida`)
      .set(auth('GESTOR_MANUTENCAO'))
      .send({ ate: '2026-10-10T10:00:00.000Z' });
    expect(perfil.status).toBe(403);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('recusa data inválida ou ausente e exige autenticação', async () => {
    const invalida = await request(app).post(`/solicitacoes/${ID}/mensagens/lida`).set(auth('GESTOR_PATRIMONIO')).send({ ate: 'ontem' });
    expect(invalida.status).toBe(422);
    const ausente = await request(app).post(`/solicitacoes/${ID}/mensagens/lida`).set(auth('GESTOR_PATRIMONIO')).send({});
    expect(ausente.status).toBe(422);
    expect((await request(app).post(`/solicitacoes/${ID}/mensagens/lida`).send({ ate: '2026-10-10T10:00:00.000Z' })).status).toBe(401);
  });
});
