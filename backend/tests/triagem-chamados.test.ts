import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const NOVO = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const CAT = '33333333-3333-4333-8333-333333333333';
const SETOR = '44444444-4444-4444-8444-444444444444';

const triadorCivil = () => auth('OPERADOR', { sub: 'triador', permissoes: ['MANUTENCAO_TRIAR_CIVIL'] });
const triadorEquip = () => auth('OPERADOR', { sub: 'triador', permissoes: ['MANUTENCAO_TRIAR_EQUIPAMENTO'] });
const semTriagem = () => auth('OPERADOR', { sub: 'op', permissoes: ['MANUTENCAO_CONSULTAR', 'MANUTENCAO_AVALIAR'] });
const unidade = () => auth('UNIDADE', { unidadeId: 'u1' });
const terceirizada = () => auth('TERCEIRIZADA', { sub: 'terc', prestadorId: 'p1' });

const triado = (extra: Record<string, unknown> = {}) => ({
  id: NOVO,
  numero: 10,
  tipo: 'CIVIL',
  unidadeId: 'u1',
  categoriaCivilId: CAT,
  equipamento: null,
  setores: [{ setorId: SETOR }],
  ...extra,
});

const existente = (extra: Record<string, unknown> = {}) => ({
  id: OUTRO,
  numero: 4,
  titulo: 'Infiltração antiga',
  status: 'EM_EXECUCAO',
  abertoPorContestacao: false,
  localAfetado: 'Recepção',
  criadoEm: new Date('2026-10-01T12:00:00Z'),
  dataConclusao: null,
  categoriaCivilId: CAT,
  categoriaCivil: { nome: 'Infiltração' },
  setores: [{ setorId: SETOR }],
  equipamento: null,
  ...extra,
});

describe('Triagem — chamados da unidade', () => {
  it('lista os outros chamados da mesma unidade e tipo, de qualquer status, com o que têm em comum', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(triado() as never);
    prismaMock.manutencao.findMany.mockResolvedValue([
      existente({ id: 'a', numero: 1, categoriaCivilId: 'outra', categoriaCivil: { nome: 'Elétrica' }, setores: [], status: 'CONCLUIDA' }),
      existente({ id: 'b', numero: 2 }),
      existente({ id: 'c', numero: 3, setores: [], status: 'AGUARDANDO_EXECUCAO' }),
    ] as never);
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([{ manutencaoId: NOVO, relacionadaId: 'c' }] as never);
    const res = await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(triadorCivil());
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { not: NOVO }, unidadeId: 'u1', tipo: 'CIVIL' } });
    // sem filtro de status: os concluídos também aparecem
    expect((prismaMock.manutencao.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where).not.toHaveProperty('status');
    // os que mais têm em comum vêm primeiro: b (categoria e setor), c (categoria), a (nada)
    expect(res.body.map((c: { id: string }) => c.id)).toEqual(['b', 'c', 'a']);
    expect(res.body[0]).toMatchObject({ relacao: { categoria: true, setor: true }, relacionado: true, vinculado: false });
    expect(res.body[1]).toMatchObject({ relacao: { categoria: true, setor: false }, vinculado: true });
    expect(res.body[2]).toMatchObject({ relacionado: false, status: 'CONCLUIDA' });
    expect(res.body[0]).not.toHaveProperty('pontos');
  });

  it('no chamado de equipamento, relaciona pelo mesmo equipamento e pelo mesmo tipo de equipamento', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(
      triado({ tipo: 'EQUIPAMENTO', categoriaCivilId: null, setores: [], equipamento: { id: 'eq1', tipoEquipamentoId: 'tipo1' } }) as never,
    );
    const eq = (id: string, tipoId: string) => ({ id, tombamento: `T-${id}`, descricao: 'x', tipoEquipamentoId: tipoId, tipoEquipamento: { nome: 'Autoclave' } });
    prismaMock.manutencao.findMany.mockResolvedValue([
      existente({ id: 'x1', categoriaCivilId: null, categoriaCivil: null, setores: [], equipamento: eq('eq2', 'tipo1') }),
      existente({ id: 'x2', categoriaCivilId: null, categoriaCivil: null, setores: [], equipamento: eq('eq1', 'tipo1') }),
    ] as never);
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([] as never);
    const res = await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(triadorEquip());
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual(['x2', 'x1']);
    expect(res.body[0].relacao).toMatchObject({ equipamento: true, tipoEquipamento: true });
    expect(res.body[1].relacao).toMatchObject({ equipamento: false, tipoEquipamento: true });
    expect(res.body[0].equipamento).toBe('Autoclave · T-eq1');
  });

  it('cada triador só vê os chamados do próprio tipo; Unidade, terceirizada e quem não tria são barrados', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(triado() as never);
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([] as never);
    expect((await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(triadorEquip())).status).toBe(403);
    expect((await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(semTriagem())).status).toBe(403);
    expect((await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(unidade())).status).toBe(403);
    expect((await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(terceirizada())).status).toBe(403);
    expect(prismaMock.manutencao.findMany).not.toHaveBeenCalled();
    prismaMock.manutencao.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`/manutencoes/${NOVO}/da-unidade`).set(triadorCivil())).status).toBe(404);
  });
});

describe('Triagem — chamados relacionados', () => {
  const basico = (id: string, extra: Record<string, unknown> = {}) => ({ id, numero: id === NOVO ? 10 : 4, tipo: 'CIVIL', unidadeId: 'u1', ...extra });
  beforeEach(() => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => basico(where.id)) as never);
    prismaMock.manutencaoVinculo.findFirst.mockResolvedValue(null);
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([] as never);
  });

  it('relaciona dois chamados da mesma unidade e tipo, audita e devolve a lista', async () => {
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([
      { criadoEm: new Date(), manutencaoId: NOVO, manutencao: { id: NOVO, numero: 10, titulo: 'Novo', status: 'PENDENTE_APROVACAO' }, relacionada: { id: OUTRO, numero: 4, titulo: 'Antigo', status: 'EM_EXECUCAO' } },
    ] as never);
    const res = await request(app).post(`/manutencoes/${NOVO}/vincular`).set(triadorCivil()).send({ relacionadaId: OUTRO });
    expect(res.status).toBe(201);
    expect(prismaMock.manutencaoVinculo.create.mock.calls[0][0].data).toEqual({ manutencaoId: NOVO, relacionadaId: OUTRO, criadoPorId: 'triador' });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'VINCULAR_CHAMADO', entidadeId: NOVO });
    expect(res.body[0]).toMatchObject({ id: OUTRO, numero: 4 });
  });

  it('recusa o próprio chamado, outra unidade, outro tipo, par já relacionado (nos dois sentidos) e chamado inexistente', async () => {
    const vincular = (corpo: unknown, token = triadorCivil()) => request(app).post(`/manutencoes/${NOVO}/vincular`).set(token).send(corpo as object);
    expect((await vincular({ relacionadaId: NOVO })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => basico(where.id, where.id === OUTRO ? { unidadeId: 'u2' } : {})) as never);
    expect((await vincular({ relacionadaId: OUTRO })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => basico(where.id, where.id === OUTRO ? { tipo: 'EQUIPAMENTO' } : {})) as never);
    expect((await vincular({ relacionadaId: OUTRO })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === OUTRO ? null : basico(where.id))) as never);
    expect((await vincular({ relacionadaId: OUTRO })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => basico(where.id)) as never);
    prismaMock.manutencaoVinculo.findFirst.mockResolvedValue({ id: 'v1' } as never);
    expect((await vincular({ relacionadaId: OUTRO })).status).toBe(409);
    expect(prismaMock.manutencaoVinculo.findFirst.mock.calls[0][0]).toMatchObject({
      where: { OR: [{ manutencaoId: NOVO, relacionadaId: OUTRO }, { manutencaoId: OUTRO, relacionadaId: NOVO }] },
    });
    expect((await vincular({ relacionadaId: 'abc' })).status).toBe(422);
    expect(prismaMock.manutencaoVinculo.create).not.toHaveBeenCalled();
  });

  it('só quem tria o tipo do chamado relaciona', async () => {
    const vincular = (token: Record<string, string>) => request(app).post(`/manutencoes/${NOVO}/vincular`).set(token).send({ relacionadaId: OUTRO });
    expect((await vincular(triadorEquip())).status).toBe(403);
    expect((await vincular(semTriagem())).status).toBe(403);
    expect((await vincular(unidade())).status).toBe(403);
    expect((await vincular(terceirizada())).status).toBe(403);
    expect(prismaMock.manutencaoVinculo.create).not.toHaveBeenCalled();
  });

  it('desfaz a relação nos dois sentidos e audita; relação inexistente dá 404', async () => {
    prismaMock.manutencaoVinculo.deleteMany.mockResolvedValue({ count: 1 } as never);
    const res = await request(app).delete(`/manutencoes/${NOVO}/vinculos/${OUTRO}`).set(triadorCivil());
    expect(res.status).toBe(200);
    expect(prismaMock.manutencaoVinculo.deleteMany.mock.calls[0][0]).toMatchObject({
      where: { OR: [{ manutencaoId: NOVO, relacionadaId: OUTRO }, { manutencaoId: OUTRO, relacionadaId: NOVO }] },
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'DESVINCULAR_CHAMADO' });
    prismaMock.manutencaoVinculo.deleteMany.mockResolvedValue({ count: 0 } as never);
    expect((await request(app).delete(`/manutencoes/${NOVO}/vinculos/${OUTRO}`).set(triadorCivil())).status).toBe(404);
    expect((await request(app).delete(`/manutencoes/${NOVO}/vinculos/abc`).set(triadorCivil())).status).toBe(422);
    expect((await request(app).delete(`/manutencoes/${NOVO}/vinculos/${OUTRO}`).set(triadorEquip())).status).toBe(403);
  });

  it('lista os relacionados do chamado, olhando os dois sentidos', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...basico(NOVO), unidade: { id: 'u1' }, contrato: null } as never);
    prismaMock.manutencaoVinculo.findMany.mockResolvedValue([
      { criadoEm: new Date(), manutencaoId: NOVO, manutencao: { id: NOVO, numero: 10, titulo: 'N', status: 'PENDENTE_APROVACAO' }, relacionada: { id: OUTRO, numero: 4, titulo: 'A', status: 'CONCLUIDA' } },
      { criadoEm: new Date(), manutencaoId: 'z', manutencao: { id: 'z', numero: 2, titulo: 'Z', status: 'ENCERRADA' }, relacionada: { id: NOVO, numero: 10, titulo: 'N', status: 'PENDENTE_APROVACAO' } },
    ] as never);
    const res = await request(app).get(`/manutencoes/${NOVO}/vinculos`).set(triadorCivil());
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([OUTRO, 'z']);
    expect(prismaMock.manutencaoVinculo.findMany.mock.calls[0][0]).toMatchObject({ where: { OR: [{ manutencaoId: NOVO }, { relacionadaId: NOVO }] } });
    // a terceirizada não chega a esta rota
    expect((await request(app).get(`/manutencoes/${NOVO}/vinculos`).set(terceirizada())).status).toBe(403);
  });
});

describe('Triagem — unificar duplicados', () => {
  const carregado = (extra: Record<string, unknown> = {}) => ({
    id: NOVO,
    numero: 10,
    tipo: 'CIVIL',
    status: 'PENDENTE_APROVACAO',
    unidadeId: 'u1',
    equipamentoId: null,
    titulo: 'Infiltração de novo',
    descricaoProblema: 'A mancha voltou',
    fotos: ['/uploads/solicitacoes/f1.jpg'],
    problemasExtras: [{ fotos: ['/uploads/solicitacoes/f2.jpg'] }],
    unidade: { id: 'u1', nome: 'UBS', emailBase: 'ubs@x.gov' },
    contrato: null,
    motivoEncerramento: 'Unificado ao chamado MAN-0004.',
    ...extra,
  });
  const original = (extra: Record<string, unknown> = {}) => ({
    id: OUTRO, numero: 4, tipo: 'CIVIL', unidadeId: 'u1', status: 'AGUARDANDO_AVALIACAO_TECNICA', _count: { problemasExtras: 0 }, ...extra,
  });
  const unificar = (corpo: unknown = { chamadoOriginalId: OUTRO }, token = triadorCivil()) => request(app).post(`/manutencoes/${NOVO}/unificar`).set(token).send(corpo as object);

  beforeEach(() => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado() : original())) as never);
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(carregado({ status: 'ENCERRADA' }) as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.manutencaoProblema.create.mockResolvedValue({} as never);
  });

  it('encerra como unificado e acrescenta o problema (texto e fotos) ao original que ainda não foi ao prestador', async () => {
    const res = await unificar({ chamadoOriginalId: OUTRO, motivo: 'Mesmo vazamento' });
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: NOVO, status: { in: ['PENDENTE_APROVACAO', 'AVALIADO'] } },
      data: { status: 'ENCERRADA', tipoEncerramento: 'UNIFICADO', motivoEncerramento: 'Mesmo vazamento', chamadoOriginalId: OUTRO, decididoPorId: 'triador' },
    });
    const problema = prismaMock.manutencaoProblema.create.mock.calls[0][0].data as { manutencaoId: string; descricao: string; fotos: string[] };
    expect(problema.manutencaoId).toBe(OUTRO);
    expect(problema.descricao).toBe('Chamado MAN-0010 · Infiltração de novo: A mancha voltou');
    expect(problema.fotos).toEqual(['/uploads/solicitacoes/f1.jpg', '/uploads/solicitacoes/f2.jpg']);
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({
      acao: 'UNIFICAR_CHAMADO',
      dadosDepois: { chamadoOriginalId: OUTRO, acrescentouAoOriginal: true },
    });
  });

  it('sem motivo, usa o número do original; original que já está com o prestador só recebe a ligação (não o problema)', async () => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado() : original({ status: 'AGUARDANDO_EXECUCAO' }))) as never);
    expect((await unificar()).status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({ data: { motivoEncerramento: 'Unificado ao chamado MAN-0004.' } });
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ dadosDepois: { acrescentouAoOriginal: false } });
  });

  it('não acrescenta além do limite de problemas do original', async () => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado() : original({ _count: { problemasExtras: 20 } }))) as never);
    expect((await unificar()).status).toBe(200);
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('chamado de equipamento: encerra, libera o equipamento e não acrescenta problema', async () => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) =>
      where.id === NOVO ? carregado({ tipo: 'EQUIPAMENTO', equipamentoId: 'eq1' }) : original({ tipo: 'EQUIPAMENTO' })) as never);
    prismaMock.equipamento.updateMany.mockResolvedValue({ count: 1 } as never);
    expect((await unificar(undefined, triadorEquip())).status).toBe(200);
    expect(prismaMock.equipamento.updateMany).toHaveBeenCalledWith({ where: { id: 'eq1', status: 'EM_MANUTENCAO' }, data: { status: 'ATIVO' } });
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('recusa chamado que já saiu da triagem, original de outra unidade ou tipo, original finalizado e ele mesmo', async () => {
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado({ status: 'AGUARDANDO_EXECUCAO' }) : original())) as never);
    expect((await unificar()).status).toBe(422);
    for (const ruim of [{ unidadeId: 'u2' }, { tipo: 'EQUIPAMENTO' }, { status: 'CONCLUIDA' }, { status: 'ENCERRADA' }, { status: 'NEGADA' }, { status: 'BAIXADO' }]) {
      prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado() : original(ruim))) as never);
      expect([JSON.stringify(ruim), (await unificar()).status]).toEqual([JSON.stringify(ruim), 422]);
    }
    expect((await unificar({ chamadoOriginalId: NOVO })).status).toBe(422);
    expect((await unificar({ chamadoOriginalId: 'abc' })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => (where.id === NOVO ? carregado() : null)) as never);
    expect((await unificar()).status).toBe(422);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('decisão que mudou no meio do caminho dá 409 e não acrescenta nada', async () => {
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 } as never);
    expect((await unificar()).status).toBe(409);
    expect(prismaMock.manutencaoProblema.create).not.toHaveBeenCalled();
  });

  it('só quem tria o tipo do chamado unifica', async () => {
    expect((await unificar(undefined, triadorEquip())).status).toBe(403);
    expect((await unificar(undefined, semTriagem())).status).toBe(403);
    expect((await unificar(undefined, unidade())).status).toBe(403);
    expect((await unificar(undefined, terceirizada())).status).toBe(403);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
  });
});
