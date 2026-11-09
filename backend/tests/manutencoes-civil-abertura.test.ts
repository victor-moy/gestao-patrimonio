import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const CAT = '77777777-7777-4777-8777-777777777777';
const P1 = '66666666-6666-4666-8666-666666666666';
const P2 = '55555555-5555-4555-8555-555555555555';
const MAN = '99999999-9999-4999-8999-999999999999';

const unidade = (id = 'unidade-1') => auth('UNIDADE', { unidadeId: id });
const escritor = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_ESCREVER'] });

const perguntas = [
  { id: P1, texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true, ordem: 0, ativo: true },
  { id: P2, texto: 'Observação sobre o local', tipo: 'TEXTO', opcoes: [], obrigatoria: false, ordem: 1, ativo: true },
];

const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: MAN,
    numero: 7,
    tipo: 'CIVIL',
    unidadeId: 'unidade-1',
    status: 'PENDENTE_APROVACAO',
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    ...extra,
  }) as never;

describe('Abertura de chamado civil: perguntas da categoria', () => {
  const abrir = (respostas: Record<string, string> | undefined) => {
    const req = request(app)
      .post('/manutencoes/civil')
      .set(unidade())
      .field('titulo', 'Vazamento na pia')
      .field('descricaoProblema', 'Pia da copa vazando')
      .field('localAfetado', 'Copa')
      .field('categoriaCivilId', CAT);
    return respostas === undefined ? req : req.field('respostas', JSON.stringify(respostas));
  };
  const preparar = (categoria: unknown = { ativo: true, perguntas }) => {
    prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
    prismaMock.setor.count.mockResolvedValue(0);
    prismaMock.categoriaCivil.findUnique.mockResolvedValue(categoria as never);
    prismaMock.manutencao.create.mockResolvedValue(chamado());
  };

  it('guarda as respostas com o texto da pergunta da época', async () => {
    preparar();

    const res = await abrir({ [P1]: 'Sim', [P2]: '  atrás da porta  ' });

    expect(res.status).toBe(201);
    expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({
      categoriaCivilId: CAT,
      respostas: {
        create: [
          { perguntaId: P1, perguntaTexto: 'O vazamento é contínuo?', resposta: 'Sim', ordem: 0 },
          { perguntaId: P2, perguntaTexto: 'Observação sobre o local', resposta: 'atrás da porta', ordem: 1 },
        ],
      },
    });
  });

  it('pergunta opcional sem resposta fica de fora', async () => {
    preparar();
    expect((await abrir({ [P1]: 'Não' })).status).toBe(201);
    const { respostas } = prismaMock.manutencao.create.mock.calls[0][0].data as { respostas: { create: unknown[] } };
    expect(respostas.create).toHaveLength(1);
  });

  it.each([
    ['pergunta obrigatória sem resposta', { [P2]: 'x' }],
    ['opção que não existe no cadastro', { [P1]: 'Talvez' }],
    ['resposta a pergunta de outra categoria', { [P1]: 'Sim', '44444444-4444-4444-8444-444444444444': 'x' }],
  ])('recusa %s', async (_nome, respostas) => {
    preparar();
    expect((await abrir(respostas)).status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
  });

  it('recusa categoria desativada ou inexistente', async () => {
    preparar({ ativo: false, perguntas: [] });
    expect((await abrir({})).status).toBe(422);
    preparar(null);
    expect((await abrir({})).status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
  });
});

describe('Chamados civis em aberto da mesma categoria', () => {
  const consultar = (headers = unidade(), consulta = `categoriaCivilId=${CAT}`) =>
    request(app).get(`/manutencoes/civil/abertos?${consulta}`).set(headers);

  it('a Unidade vê os da própria unidade (vem do token) e quais aceitam outro problema', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([
      { id: 'a', numero: 1, status: 'PENDENTE_APROVACAO' },
      { id: 'b', numero: 2, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
      { id: 'c', numero: 3, status: 'AGUARDANDO_EXECUCAO' },
    ] as never);

    const res = await consultar(unidade(), `categoriaCivilId=${CAT}&unidadeId=11111111-1111-4111-8111-111111111111`);

    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({
      tipo: 'CIVIL',
      unidadeId: 'unidade-1',
      categoriaCivilId: CAT,
      status: { notIn: ['NEGADA', 'ENCERRADA', 'CONCLUIDA', 'BAIXADO'] },
    });
    expect(res.body.map((m: { aceitaProblemas: boolean }) => m.aceitaProblemas)).toEqual([true, true, false]);
  });

  it('o operador precisa informar a unidade; terceirizada não consulta', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    expect((await consultar(escritor())).status).toBe(422);
    expect((await consultar(escritor(), `categoriaCivilId=${CAT}&unidadeId=11111111-1111-4111-8111-111111111111`)).status).toBe(200);
    expect((await consultar(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
  });
});

describe('Acrescentar outro problema a um chamado civil', () => {
  const acrescentar = (headers = unidade(), descricao = 'Torneira do banheiro também pinga') =>
    request(app).post(`/manutencoes/${MAN}/problemas`).set(headers).field('descricao', descricao);
  const preparar = (status = 'PENDENTE_APROVACAO', extras = 0) => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status }));
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ status, _count: { problemasExtras: extras } } as never);
    prismaMock.manutencaoProblema.create.mockResolvedValue({ id: 'prob-1' } as never);
  };

  it.each(['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA'])('aceita em %s e audita', async (status) => {
    preparar(status);
    const res = await acrescentar();
    expect(res.status).toBe(201);
    expect(prismaMock.manutencaoProblema.create.mock.calls[0][0].data).toMatchObject({
      manutencaoId: MAN,
      descricao: 'Torneira do banheiro também pinga',
      criadoPorId: 'user-1',
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'ADICIONAR_PROBLEMA_MANUTENCAO', entidadeId: MAN });
  });

  it.each(['AGUARDANDO_EXECUCAO', 'EM_EXECUCAO', 'CONCLUIDA', 'BLOQUEADO'])('recusa em %s: o chamado já saiu da triagem', async (status) => {
    preparar(status);
    expect((await acrescentar()).status).toBe(422);
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('recusa quando a triagem decidiu entre a leitura e a gravação (status relido sob trava)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ status: 'AGUARDANDO_EXECUCAO', _count: { problemasExtras: 0 } } as never);
    expect((await acrescentar()).status).toBe(422);
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('limita a 20 problemas acrescentados', async () => {
    preparar('PENDENTE_APROVACAO', 20);
    expect((await acrescentar()).status).toBe(422);
  });

  it('outra unidade e terceirizada não acrescentam; descrição curta é recusada', async () => {
    preparar();
    expect((await acrescentar(unidade('unidade-2'))).status).toBe(403);
    expect((await acrescentar(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
    expect((await acrescentar(unidade(), 'ab')).status).toBe(422);
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('só vale para chamado civil', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ tipo: 'EQUIPAMENTO' }));
    expect((await acrescentar()).status).toBe(422);
  });
});
