import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';
import { calcularSla, ordenarCivis } from '../src/modules/manutencoes/manutencoes.prazo';

const app = criarApp();
const MAN = '99999999-9999-4999-8999-999999999999';
const ITEM = '66666666-6666-4666-8666-666666666666';
const H = 3_600_000;
const AGORA = new Date('2026-11-25T12:00:00Z');
const antes = (horas: number) => new Date(AGORA.getTime() - horas * H);

const base = {
  tipo: 'CIVIL' as const,
  status: 'AGUARDANDO_EXECUCAO' as const,
  prioridade: 'MUITO_ALTA' as const,
  slaInicioEm: antes(1) as Date | null,
  slaHoras: 2 as number | null,
  slaFimEm: null as Date | null,
  slaBloqueadoSegundos: 0,
  bloqueadoEm: null as Date | null,
};

describe('calcularSla', () => {
  it('não existe em chamado de equipamento nem em chamado civil sem prioridade', () => {
    expect(calcularSla({ ...base, tipo: 'EQUIPAMENTO' }, AGORA)).toBeNull();
    expect(calcularSla({ ...base, prioridade: null }, AGORA)).toBeNull();
  });

  it('aguarda enquanto o chamado não foi ao prestador', () => {
    expect(calcularSla({ ...base, slaInicioEm: null, status: 'AVALIADO' }, AGORA)?.situacao).toBe('AGUARDANDO');
    expect(calcularSla({ ...base, slaInicioEm: null, status: 'NEGADA' }, AGORA)?.situacao).toBe('ENCERRADO');
  });

  it('prioridade baixa é planejada, sem vencimento', () => {
    expect(calcularSla({ ...base, prioridade: 'BAIXA', slaHoras: null }, AGORA)).toMatchObject({ situacao: 'PLANEJADO', venceEm: null });
  });

  it('sem horas no item de contrato, o prazo é "não configurado" e não vira "no prazo"', () => {
    expect(calcularSla({ ...base, slaHoras: null }, AGORA)?.situacao).toBe('NAO_CONFIGURADO');
  });

  it('conta restante, vence e passa a vencido', () => {
    expect(calcularSla(base, AGORA)).toMatchObject({ situacao: 'NO_PRAZO', minutosRestantes: 60, venceEm: new Date(AGORA.getTime() + H).toISOString() });
    expect(calcularSla({ ...base, slaInicioEm: antes(3) }, AGORA)).toMatchObject({ situacao: 'VENCIDO', minutosRestantes: -60 });
  });

  it('desconta o tempo bloqueado depois do início e fica pausado enquanto bloqueado', () => {
    // 3 h desde o início, mas 2 h bloqueado: ainda sobra 1 h dentro das 2 h do prazo + 2 h = vence em 1 h
    expect(calcularSla({ ...base, slaInicioEm: antes(3), slaBloqueadoSegundos: 7200 }, AGORA)).toMatchObject({ situacao: 'NO_PRAZO', minutosRestantes: 60, pausado: false });
    const pausado = calcularSla({ ...base, status: 'BLOQUEADO', slaInicioEm: antes(3), bloqueadoEm: antes(2) }, AGORA);
    expect(pausado).toMatchObject({ situacao: 'NO_PRAZO', pausado: true });
  });

  it('o relógio para quando o prestador executa; não reinicia nem reabre depois', () => {
    expect(calcularSla({ ...base, status: 'EXECUTADO', slaFimEm: antes(0.5) }, AGORA)).toMatchObject({ situacao: 'CUMPRIDO', minutosRestantes: null });
    expect(calcularSla({ ...base, status: 'AGUARDANDO_MEDICAO', slaInicioEm: antes(5), slaFimEm: antes(1) }, AGORA)?.situacao).toBe('CUMPRIDO_COM_ATRASO');
  });

  it('chamado encerrado sem execução não aparece como vencido', () => {
    expect(calcularSla({ ...base, slaInicioEm: antes(9), status: 'CONCLUIDA' }, AGORA)?.situacao).toBe('ENCERRADO');
  });
});

describe('ordenarCivis', () => {
  const chamado = (id: string, extra: Record<string, unknown> = {}) => ({ ...base, id, criadoEm: antes(10), categoriaCivil: { gravidade: 0 }, ...extra });

  it('abertos antes dos encerrados; depois gravidade, prazo vencido, prioridade e antiguidade', () => {
    const lista = [
      chamado('concluido', { status: 'CONCLUIDA', categoriaCivil: { gravidade: 3 } }),
      chamado('antigo-normal', { criadoEm: antes(50), prioridade: 'MEDIA' }),
      chamado('novo-normal', { criadoEm: antes(2), prioridade: 'MEDIA' }),
      chamado('vencido', { slaInicioEm: antes(9) }),
      chamado('grave', { categoriaCivil: { gravidade: 2 }, prioridade: 'BAIXA' }),
      chamado('muito-grave', { categoriaCivil: { gravidade: 3 }, criadoEm: antes(1) }),
    ];
    expect(ordenarCivis(lista, AGORA).map((m) => m.id)).toEqual(['muito-grave', 'grave', 'vencido', 'antigo-normal', 'novo-normal', 'concluido']);
  });

  it('não altera a lista recebida', () => {
    const lista = [chamado('a', { criadoEm: antes(1) }), chamado('b', { criadoEm: antes(5) })];
    ordenarCivis(lista, AGORA);
    expect(lista.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('Prioridade e SLA no fluxo do chamado civil', () => {
  const triador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_TRIAR_CIVIL', 'MANUTENCAO_CONSULTAR'] });
  const comprometido = () => prismaMock.$queryRaw.mockResolvedValue([] as never);
  const chamadoCivil = (extra: Record<string, unknown> = {}) => ({
    id: MAN,
    numero: 7,
    tipo: 'CIVIL',
    equipamento: null,
    unidadeId: 'unidade-1',
    titulo: 'Vazamento',
    status: 'PENDENTE_APROVACAO',
    prioridade: null,
    slaInicioEm: null,
    slaHoras: null,
    slaFimEm: null,
    slaBloqueadoSegundos: 0,
    bloqueadoEm: null,
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    contrato: { id: 'ct-1', numero: 'CONT-1', prestadorId: 'p-1', prestador: { nome: 'Predial' } },
    linhasRelatorio: [],
    ...extra,
  });
  const itemContrato = { id: ITEM, contratoId: 'ct-1', valor: 10000, contrato: { status: 'ATIVO' }, slaHorasMedia: 48, slaHorasMuitoAlta: 4, servico: {} };
  const aprovar = (corpo: object) => request(app).post(`/manutencoes/${MAN}/aprovar`).set(triador()).send(corpo);

  it('civil exige a prioridade na aprovação', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil() as never);
    const res = await aprovar({ contratoItemId: ITEM });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toMatch(/prioridade/i);
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
  });

  it('recusa prioridade inválida e prioridade em chamado de equipamento', async () => {
    expect((await aprovar({ contratoItemId: ITEM, prioridade: 'URGENTE' })).status).toBe(422);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil({ tipo: 'EQUIPAMENTO' }) as never);
    const res = await request(app)
      .post(`/manutencoes/${MAN}/aprovar`)
      .set(auth('OPERADOR', { permissoes: ['MANUTENCAO_TRIAR_EQUIPAMENTO'] }))
      .send({ contratoItemId: ITEM, prioridade: 'MEDIA' });
    expect(res.status).toBe(422);
  });

  it('ao ir direto ao prestador, grava a prioridade e inicia o SLA com as horas congeladas do item', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil() as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue(itemContrato as never);
    comprometido();
    prismaMock.manutencao.update.mockResolvedValue(chamadoCivil({ status: 'AGUARDANDO_EXECUCAO', prioridade: 'MUITO_ALTA' }) as never);
    const res = await aprovar({ contratoItemId: ITEM, prioridade: 'MUITO_ALTA' });
    expect(res.status).toBe(200);
    const { data } = prismaMock.manutencao.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'AGUARDANDO_EXECUCAO', prioridade: 'MUITO_ALTA', slaHoras: 4 });
    expect(data.slaInicioEm).toBeInstanceOf(Date);
  });

  it('prioridade baixa inicia o relógio sem prazo; item sem horas fica sem prazo', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil() as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue({ ...itemContrato, slaHorasMedia: null } as never);
    comprometido();
    prismaMock.manutencao.update.mockResolvedValue(chamadoCivil({ status: 'AGUARDANDO_EXECUCAO' }) as never);
    await aprovar({ contratoItemId: ITEM, prioridade: 'BAIXA' });
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ prioridade: 'BAIXA', slaHoras: null });
    prismaMock.manutencao.update.mockClear();
    await aprovar({ contratoItemId: ITEM, prioridade: 'MEDIA' });
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ prioridade: 'MEDIA', slaHoras: null });
  });

  it('com avaliação técnica o SLA ainda não começa: só guarda a prioridade', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil() as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue({ ...itemContrato, servico: { exigeAvaliacaoTecnica: true } } as never);
    comprometido();
    prismaMock.manutencao.update.mockResolvedValue(chamadoCivil({ status: 'AGUARDANDO_AVALIACAO_TECNICA' }) as never);
    await aprovar({ contratoItemId: ITEM, prioridade: 'MEDIA' });
    const { data } = prismaMock.manutencao.update.mock.calls[0][0];
    expect(data).toMatchObject({ status: 'AGUARDANDO_AVALIACAO_TECNICA', prioridade: 'MEDIA' });
    expect(data).not.toHaveProperty('slaInicioEm');
  });

  it('encaminhar depois da avaliação inicia o SLA; o relógio já iniciado não reinicia', async () => {
    const avaliador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_AVALIAR'] });
    const url = `/manutencoes/${MAN}/concluir-avaliacao`;
    prismaMock.manutencao.findUnique
      .mockResolvedValueOnce(chamadoCivil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItemId: ITEM, prioridade: 'MEDIA' }) as never)
      .mockResolvedValue(chamadoCivil({ status: 'AGUARDANDO_EXECUCAO' }) as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue(itemContrato as never);
    comprometido();
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
    expect((await request(app).post(url).set(avaliador()).send({ parecer: 'Reparo viável' })).status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toMatchObject({ slaHoras: 48 });

    prismaMock.manutencao.updateMany.mockClear();
    prismaMock.manutencao.findUnique
      .mockResolvedValueOnce(chamadoCivil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItemId: ITEM, prioridade: 'MEDIA', slaInicioEm: antes(5), slaHoras: 48 }) as never)
      .mockResolvedValue(chamadoCivil({ status: 'AGUARDANDO_EXECUCAO' }) as never);
    await request(app).post(url).set(avaliador()).send({ parecer: 'Reparo viável' });
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).not.toHaveProperty('slaInicioEm');
  });

  it('a resposta traz o prazo calculado; a terceirizada o vê sem valores', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(
      chamadoCivil({ status: 'AGUARDANDO_EXECUCAO', prioridade: 'MUITO_ALTA', slaInicioEm: new Date(Date.now() - H), slaHoras: 2, contratoItem: { id: ITEM, valor: 10000, descontoPercentual: 5 } }) as never,
    );
    const res = await request(app).get(`/manutencoes/${MAN}`).set(auth('TERCEIRIZADA', { prestadorId: 'p-1' }));
    expect(res.status).toBe(200);
    expect(res.body.sla).toMatchObject({ situacao: 'NO_PRAZO', pausado: false });
    expect(res.body.contratoItem).not.toHaveProperty('valor');
  });

  it('desbloquear soma o tempo parado ao SLA só se o relógio já tinha começado', async () => {
    const parado = { status: 'BLOQUEADO', statusAntesBloqueio: 'AGUARDANDO_EXECUCAO', motivoBloqueio: 'x', bloqueadoEm: antes(1), tempoBloqueadoSegundos: 0 };
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamadoCivil() as never);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil({ ...parado, slaInicioEm: antes(2), slaHoras: 4 }) as never);
    await request(app).post(`/manutencoes/${MAN}/desbloquear`).set(triador());
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toHaveProperty('slaBloqueadoSegundos');

    prismaMock.manutencao.updateMany.mockClear();
    prismaMock.manutencao.findUnique.mockResolvedValue(chamadoCivil({ ...parado }) as never);
    await request(app).post(`/manutencoes/${MAN}/desbloquear`).set(triador());
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).not.toHaveProperty('slaBloqueadoSegundos');
  });

  it('a lista civil vem ordenada por gravidade; a de equipamento não é reordenada', async () => {
    const m = (id: string, gravidade: number, quando: number) => chamadoCivil({ id, criadoEm: new Date(quando), categoriaCivil: { gravidade }, status: 'AGUARDANDO_EXECUCAO' });
    prismaMock.manutencao.findMany.mockResolvedValue([m('normal-antigo', 0, 1), m('grave-novo', 3, 9)] as never);
    const civil = await request(app).get('/manutencoes?tipo=CIVIL').set(triador());
    expect(civil.body.map((x: { id: string }) => x.id)).toEqual(['grave-novo', 'normal-antigo']);
    const todos = await request(app).get('/manutencoes').set(triador());
    expect(todos.body.map((x: { id: string }) => x.id)).toEqual(['normal-antigo', 'grave-novo']);
  });
});

describe('Cadastros de gravidade e de prazo', () => {
  const config = () => auth('OPERADOR', { permissoes: ['CONFIGURACOES_GERENCIAR'] });

  it('a categoria civil aceita gravidade de 0 a 3 e recusa fora disso', async () => {
    prismaMock.categoriaCivil.findUnique.mockResolvedValue({ id: 'c1', nome: 'Hidráulica', ativo: true, gravidade: 0 } as never);
    prismaMock.categoriaCivil.findUniqueOrThrow.mockResolvedValue({ id: 'c1', nome: 'Hidráulica', gravidade: 2, perguntas: [] } as never);
    expect((await request(app).patch('/categorias-civis/c1').set(config()).send({ gravidade: 4 })).status).toBe(422);
    expect((await request(app).patch('/categorias-civis/c1').set(config()).send({ gravidade: -1 })).status).toBe(422);
    const ok = await request(app).patch('/categorias-civis/c1').set(config()).send({ gravidade: 2 });
    expect(ok.status).toBe(200);
    expect(prismaMock.categoriaCivil.update.mock.calls[0][0]).toMatchObject({ data: { gravidade: 2 } });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ dadosAntes: { gravidade: 0 }, dadosDepois: { gravidade: 2 } });
  });

  it('sem permissão de configurar, não altera a gravidade', async () => {
    const res = await request(app).patch('/categorias-civis/c1').set(auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] })).send({ gravidade: 2 });
    expect(res.status).toBe(403);
  });
});
