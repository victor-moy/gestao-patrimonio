/* eslint-disable security/detect-non-literal-fs-filename -- caminhos fixos da pasta de laudos usada nos testes */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';
import { LAUDOS_DIR } from '../src/lib/uploads';

const app = criarApp();
const MAN = '99999999-9999-4999-8999-999999999999';
const ITEM = '66666666-6666-4666-8666-666666666666';
const COT = '44444444-4444-4444-8444-444444444444';
const PDF = Buffer.from('%PDF-1.4\n% proposta de teste\n');

const terc = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: 'prestador-1' });
const avaliador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_AVALIAR'] });
const fiscal = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_FISCALIZAR'] });
const triador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_TRIAR'] });
const unidade = () => auth('UNIDADE', { unidadeId: 'unidade-1' });

const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: MAN,
    numero: 7,
    tipo: 'CIVIL',
    unidadeId: 'unidade-1',
    status: 'AGUARDANDO_AVALIACAO_TECNICA',
    contratoItemId: ITEM,
    rodadaOrcamento: 0,
    cotacaoAprovadaId: null,
    dispensaOrcamentoMotivo: null,
    titulo: 'Reforma do telhado',
    contrato: { id: 'ct-1', numero: 'C-1', prestadorId: 'prestador-1', prestador: { nome: 'Predial' } },
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    ...extra,
  }) as never;

const item = (exige = false) =>
  ({ id: ITEM, contratoId: 'ct-1', valor: 100000, contrato: { status: 'ATIVO' }, servico: { exigeOrcamentoPrevio: exige } }) as never;

// Os testes de upload gravam PDFs de verdade: apaga o que for criado
let antes: Set<string>;
beforeEach(() => {
  antes = new Set(fs.readdirSync(LAUDOS_DIR));
  prismaMock.$queryRaw.mockResolvedValue([] as never);
});
afterEach(() => {
  for (const f of fs.readdirSync(LAUDOS_DIR)) if (!antes.has(f)) fs.rmSync(path.join(LAUDOS_DIR, f), { force: true });
});

describe('Barreira: serviço que exige orçamento prévio', () => {
  const concluir = () => request(app).post(`/manutencoes/${MAN}/concluir-avaliacao`).set(avaliador()).send({ parecer: 'Pode seguir' });

  it('a avaliação não encaminha direto ao prestador sem orçamento aprovado ou dispensa', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));

    const res = await concluir();

    expect(res.status).toBe(422);
    expect(res.body.mensagem).toMatch(/orçamento prévio/i);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
  });

  it('serviço sem a exigência segue normalmente', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValueOnce(chamado()).mockResolvedValueOnce(chamado({ status: 'AGUARDANDO_EXECUCAO' }));
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(false));
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    expect((await concluir()).status).toBe(200);
  });

  it('o triador também não encaminha um chamado avaliado se o serviço exige orçamento e não houve dispensa', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AVALIADO' }));
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));
    const res = await request(app).post(`/manutencoes/${MAN}/encaminhar-avaliado`).set(triador()).send({});
    expect(res.status).toBe(422);
  });

  it('na triagem, civil com orçamento prévio obrigatório passa pela avaliação técnica (que pede o orçamento)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'PENDENTE_APROVACAO', contratoItemId: null }));
    prismaMock.contratoItem.findUnique.mockResolvedValue({ ...(item(true) as object), servico: { exigeAvaliacaoTecnica: false, exigeOrcamentoPrevio: true } } as never);
    prismaMock.manutencao.update.mockResolvedValue(chamado());

    const res = await request(app).post(`/manutencoes/${MAN}/aprovar`).set(triador()).send({ contratoItemId: ITEM });

    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ status: 'AGUARDANDO_AVALIACAO_TECNICA' });
  });
});

describe('Risco à vida: dispensa do orçamento', () => {
  const dispensar = (headers = avaliador(), corpo: object = { justificativa: 'Telhado prestes a cair sobre a sala de espera' }) =>
    request(app).post(`/manutencoes/${MAN}/dispensar-orcamento`).set(headers).send(corpo);

  it('encaminha ao prestador guardando a justificativa e audita', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValueOnce(chamado()).mockResolvedValueOnce(chamado()).mockResolvedValueOnce(chamado({ status: 'AGUARDANDO_EXECUCAO' }));
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });

    const res = await dispensar();

    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toMatchObject({
      status: 'AGUARDANDO_EXECUCAO',
      dispensaOrcamentoMotivo: 'Telhado prestes a cair sobre a sala de espera',
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'DISPENSAR_ORCAMENTO_RISCO_VIDA' });
  });

  it('exige justificativa de verdade e a permissão de avaliar', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    expect((await dispensar(avaliador(), { justificativa: 'urgente' })).status).toBe(422);
    expect((await dispensar(triador())).status).toBe(403);
    expect((await dispensar(fiscal())).status).toBe(403);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
  });
});

describe('Solicitar o orçamento', () => {
  const solicitar = (headers = avaliador(), corpo: object = { instrucoes: 'Orçar a troca de 40 m² de telha' }) =>
    request(app).post(`/manutencoes/${MAN}/solicitar-orcamento`).set(headers).send(corpo);

  it('manda o chamado ao prestador só para cotar: rodada 1, com as instruções', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'AGUARDANDO_ORCAMENTO' }));

    expect((await solicitar()).status).toBe(200);

    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: MAN, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
      data: { status: 'AGUARDANDO_ORCAMENTO', contratoId: 'ct-1', rodadaOrcamento: 1, instrucoesOrcamento: 'Orçar a troca de 40 m² de telha' },
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'SOLICITAR_ORCAMENTO_CIVIL' });
  });

  it('só na avaliação técnica, só civil, só quem avalia e com instruções', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    expect((await solicitar(avaliador(), { instrucoes: '' })).status).toBe(422);
    expect((await solicitar(triador())).status).toBe(403);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_EXECUCAO' }));
    expect((await solicitar()).status).toBe(422);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ tipo: 'EQUIPAMENTO' }));
    expect((await solicitar()).status).toBe(422);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ contratoItemId: null }));
    expect((await solicitar()).status).toBe(422);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
  });
});

describe('Orçamento enviado pelo prestador', () => {
  const enviar = (qtd = 1, headers = terc()) => {
    let req = request(app).post(`/manutencoes/${MAN}/cotacoes`).set(headers);
    for (let i = 0; i < qtd; i++) req = req.attach('arquivos', PDF, { filename: `orcamento${i + 1}.pdf`, contentType: 'application/pdf' });
    return req;
  };
  const preparar = (jaEnviados: number, status = 'AGUARDANDO_ORCAMENTO') => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status, rodadaOrcamento: 1 }));
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValueOnce({ status, rodadaOrcamento: 1 } as never).mockResolvedValue(chamado({ status: 'ORCAMENTO_REGISTRADO', rodadaOrcamento: 1 }));
    prismaMock.cotacaoOrcamento.count.mockResolvedValue(jaEnviados);
    prismaMock.cotacaoOrcamento.createMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
  };

  it('os PDFs ficam registrados numa única entrega e o chamado vai para a decisão do fiscal', async () => {
    preparar(0);
    expect((await enviar(2)).status).toBe(201);
    const dados = prismaMock.cotacaoOrcamento.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(dados).toHaveLength(2);
    expect(dados[0]).toMatchObject({ manutencaoId: MAN, rodada: 1, enviadoPorId: 'terc-1', arquivo: expect.stringMatching(/^\/uploads\/laudos\/[0-9a-f-]{36}\.pdf$/) });
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: MAN, status: 'AGUARDANDO_ORCAMENTO' }, data: { status: 'ORCAMENTO_REGISTRADO' } });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'ENVIAR_ORCAMENTO', dadosDepois: { rodada: 1, arquivos: 2 } });
  });

  it('não aceita uma segunda entrega na mesma rodada, nem fora de "aguardando orçamento", nem sem arquivo', async () => {
    preparar(1);
    expect((await enviar()).status).toBe(422);
    preparar(0, 'EM_EXECUCAO');
    expect((await enviar()).status).toBe(422);
    expect((await enviar(0)).status).toBe(422);
    expect(prismaMock.cotacaoOrcamento.createMany).not.toHaveBeenCalled();
    expect(fs.readdirSync(LAUDOS_DIR).filter((f) => !antes.has(f))).toHaveLength(0); // sem PDF órfão
  });

  it('só PDF de verdade, até 5 arquivos, e só o prestador do contrato envia', async () => {
    preparar(0);
    const falso = await request(app).post(`/manutencoes/${MAN}/cotacoes`).set(terc()).attach('arquivos', Buffer.from('<?php ?>'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(falso.status).toBe(422);
    expect((await enviar(6)).status).toBeGreaterThanOrEqual(400);
    expect((await enviar(1, fiscal())).status).toBe(403);
    expect((await enviar(1, unidade())).status).toBe(403);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_ORCAMENTO', contrato: { id: 'ct-9', numero: 'C-9', prestadorId: 'outro', prestador: { nome: 'Outro' } } }));
    expect((await enviar()).status).toBe(403);
    expect(prismaMock.cotacaoOrcamento.createMany).not.toHaveBeenCalled();
    expect(fs.readdirSync(LAUDOS_DIR).filter((f) => !antes.has(f))).toHaveLength(0);
  });
});

describe('Decisão do fiscal sobre o orçamento', () => {
  const aprovar = (headers = fiscal(), corpo: object = { valor: 12500.5 }) => request(app).post(`/manutencoes/${MAN}/aprovar-cotacao`).set(headers).send(corpo);
  const rejeitar = (headers = fiscal(), corpo: object = { motivo: 'Valores acima do mercado' }) => request(app).post(`/manutencoes/${MAN}/rejeitar-cotacoes`).set(headers).send(corpo);
  const decidindo = (extra: Record<string, unknown> = {}) => chamado({ status: 'ORCAMENTO_REGISTRADO', rodadaOrcamento: 2, ...extra });

  it('aprovar libera a execução com o valor informado pelo fiscal e confere o saldo', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(decidindo());
    prismaMock.cotacaoOrcamento.findFirst.mockResolvedValue({ id: COT, rodada: 2 } as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(decidindo({ status: 'AGUARDANDO_EXECUCAO' }));

    expect((await aprovar()).status).toBe(200);

    expect(prismaMock.cotacaoOrcamento.findFirst.mock.calls[0][0]).toMatchObject({ where: { manutencaoId: MAN, rodada: 2 } });
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: MAN, status: 'ORCAMENTO_REGISTRADO' },
      data: { status: 'AGUARDANDO_EXECUCAO', cotacaoAprovadaId: COT, orcamentoValor: 12500.5 },
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'APROVAR_ORCAMENTO', dadosDepois: { valor: 12500.5 } });
  });

  it('a rodada aprovada é a lida com a linha travada, não a lida antes (rejeitado e reenviado no intervalo)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(decidindo({ rodadaOrcamento: 1 }));
    prismaMock.cotacaoOrcamento.findFirst.mockResolvedValue({ id: COT, rodada: 3 } as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue(item(true));
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(decidindo({ rodadaOrcamento: 3 }));
    expect((await aprovar()).status).toBe(200);
    expect(prismaMock.$queryRaw).toHaveBeenCalled();
    expect(prismaMock.cotacaoOrcamento.findFirst.mock.calls[0][0]).toMatchObject({ where: { manutencaoId: MAN, rodada: 3 } });
  });

  it('valor acima do saldo do item é recusado; valor inválido e rodada sem arquivos também', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(decidindo());
    prismaMock.contratoItem.findUnique.mockResolvedValue({ ...(item() as object), valor: 100 } as never);
    prismaMock.cotacaoOrcamento.findFirst.mockResolvedValue({ id: COT, rodada: 2 } as never);
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(decidindo());
    expect((await aprovar()).status).toBe(422);
    expect((await aprovar(fiscal(), { valor: 0 })).status).toBe(422);
    expect((await aprovar(fiscal(), {})).status).toBe(422);
    prismaMock.cotacaoOrcamento.findFirst.mockResolvedValue(null);
    expect((await aprovar()).status).toBe(404);
    expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
  });

  it('rejeitar abre uma nova rodada de envio para o prestador', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(decidindo());
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(decidindo({ status: 'AGUARDANDO_ORCAMENTO', rodadaOrcamento: 3 }));

    expect((await rejeitar()).status).toBe(200);

    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: MAN, status: 'ORCAMENTO_REGISTRADO' },
      data: { status: 'AGUARDANDO_ORCAMENTO', rodadaOrcamento: { increment: 1 }, motivoRejeicaoOrcamento: 'Valores acima do mercado' },
    });
  });

  it('só o fiscal decide; a decisão concorrente (outro fiscal já decidiu) é recusada', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(decidindo());
    expect((await aprovar(avaliador())).status).toBe(403);
    expect((await rejeitar(terc())).status).toBe(403);
    expect((await rejeitar(fiscal(), { motivo: '' })).status).toBe(422);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 });
    expect((await rejeitar()).status).toBe(409);
  });
});

describe('Quem vê os arquivos do orçamento', () => {
  it('a Unidade não recebe os arquivos do orçamento', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'ORCAMENTO_REGISTRADO', cotacoes: [{ id: COT, valor: '12500.50', fornecedor: 'Telhas Sul' }] }));
    const res = await request(app).get(`/manutencoes/${MAN}`).set(unidade());
    expect(res.status).toBe(200);
    expect(res.body.cotacoes).toEqual([]);
  });

  it('o valor aprovado do orçamento não aparece para a Unidade nem para o prestador no chamado civil', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_EXECUCAO', orcamentoValor: '12500.50' }));
    expect((await request(app).get(`/manutencoes/${MAN}`).set(unidade())).body.orcamentoValor).toBeNull();
    expect((await request(app).get(`/manutencoes/${MAN}`).set(terc())).body.orcamentoValor).toBeNull();
    // quem consulta os chamados continua vendo
    expect((await request(app).get(`/manutencoes/${MAN}`).set(auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] }))).body.orcamentoValor).toBe('12500.50');
  });

  it('o fiscal e o prestador do contrato recebem', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'ORCAMENTO_REGISTRADO', cotacoes: [{ id: COT, valor: '12500.50', fornecedor: 'Telhas Sul' }] }));
    expect((await request(app).get(`/manutencoes/${MAN}`).set(auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] }))).body.cotacoes).toHaveLength(1);
    expect((await request(app).get(`/manutencoes/${MAN}`).set(terc())).body.cotacoes).toHaveLength(1);
  });
});
