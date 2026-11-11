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
const DOC = '44444444-4444-4444-8444-444444444444';
const PDF = Buffer.from('%PDF-1.4\n% documento de teste\n');

const terc = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: 'prestador-1' });
const fiscal = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_FISCALIZAR'] });
const unidade = () => auth('UNIDADE', { unidadeId: 'unidade-1' });

const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: MAN,
    numero: 7,
    tipo: 'CIVIL',
    unidadeId: 'unidade-1',
    status: 'EXECUTADO',
    titulo: 'Infiltração',
    contratoItemId: 'item-1',
    contrato: { id: 'ct-1', numero: 'C-1', prestadorId: 'prestador-1', prestador: { nome: 'Predial' } },
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    ...extra,
  }) as never;

const doc = (tipo: string, extra: Record<string, unknown> = {}) => ({ id: `d-${tipo}`, tipo, recusadoEm: null, ...extra });
const estado = (status: string, documentos: unknown[] = []) =>
  ({ status, ordemServico: { id: 'os1', documentos } }) as never;

// Os testes de upload gravam PDFs de verdade na pasta de laudos: apaga o que for criado
let antes: Set<string>;
beforeEach(() => {
  antes = new Set(fs.readdirSync(LAUDOS_DIR));
});
afterEach(() => {
  for (const f of fs.readdirSync(LAUDOS_DIR)) if (!antes.has(f)) fs.rmSync(path.join(LAUDOS_DIR, f), { force: true });
});

describe('Documento da OS (OS assinada)', () => {
  const enviar = (tipo: string, headers = terc()) =>
    request(app).post(`/manutencoes/${MAN}/documentos`).set(headers).field('tipo', tipo).attach('arquivo', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });
  const preparar = (status: string, documentos: unknown[] = []) => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status }));
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValueOnce(estado(status, documentos)).mockResolvedValue(chamado({ status: 'EXECUTADO' }));
    prismaMock.documentoOS.create.mockResolvedValue({} as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
  };

  it('a OS assinada fica registrada e o chamado segue para a confirmação da Unidade, contando os 7 dias dali', async () => {
    preparar('EXECUTADO');

    const res = await enviar('OS_ASSINADA');

    expect(res.status).toBe(201);
    expect(prismaMock.documentoOS.create.mock.calls[0][0].data).toMatchObject({
      ordemServicoId: 'os1',
      tipo: 'OS_ASSINADA',
      enviadoPorId: 'terc-1',
      arquivo: expect.stringMatching(/^\/uploads\/laudos\/[0-9a-f-]{36}\.pdf$/),
    });
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: MAN, status: 'EXECUTADO' },
      data: { status: 'AGUARDANDO_RETORNO', aguardandoRetornoEm: expect.any(Date) },
    });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'ENVIAR_DOCUMENTO_OS', dadosDepois: { tipo: 'OS_ASSINADA' } });
  });

  it('documento recusado não conta: o novo envio no lugar dele conclui a documentação', async () => {
    preparar('EXECUTADO', [doc('OS_ASSINADA', { recusadoEm: new Date() })]);
    expect((await enviar('OS_ASSINADA')).status).toBe(201);
    expect(prismaMock.manutencao.updateMany).toHaveBeenCalled();
  });

  it('documento já enviado não se edita nem se duplica', async () => {
    preparar('EXECUTADO', [doc('OS_ASSINADA')]);
    const res = await enviar('OS_ASSINADA');
    expect(res.status).toBe(422);
    expect(prismaMock.documentoOS.create).not.toHaveBeenCalled();
    // o arquivo que o multer já gravou não fica órfão
    expect(fs.readdirSync(LAUDOS_DIR).filter((f) => !antes.has(f))).toHaveLength(0);
  });

  it('o relatório de execução não é mais um documento da OS', async () => {
    preparar('EXECUTADO');
    expect((await enviar('RELATORIO')).status).toBe(422);
    expect(prismaMock.documentoOS.create).not.toHaveBeenCalled();
  });

  it.each(['EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO', 'CONCLUIDA'])('só se envia depois de marcar "executado" (recusa em %s)', async (status) => {
    preparar(status);
    expect((await enviar('OS_ASSINADA')).status).toBe(422);
    expect(prismaMock.documentoOS.create).not.toHaveBeenCalled();
  });

  it('só PDF de verdade, do tipo certo, pelo prestador do contrato', async () => {
    preparar('EXECUTADO');
    const falso = await request(app)
      .post(`/manutencoes/${MAN}/documentos`)
      .set(terc())
      .field('tipo', 'OS_ASSINADA')
      .attach('arquivo', Buffer.from('<?php echo 1; ?>'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(falso.status).toBe(422);
    expect((await enviar('QUALQUER')).status).toBe(422);
    expect((await enviar('OS_ASSINADA', unidade())).status).toBe(403);
    expect((await enviar('OS_ASSINADA', fiscal())).status).toBe(403);
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ contrato: { id: 'ct-9', numero: 'C-9', prestadorId: 'outro', prestador: { nome: 'Outro' } } }));
    expect((await enviar('OS_ASSINADA')).status).toBe(403);
    expect(prismaMock.documentoOS.create).not.toHaveBeenCalled();
  });
});

describe('Recusa de documento pelo fiscal', () => {
  const recusar = (headers = fiscal(), corpo: object = { motivo: 'Sem a assinatura do responsável' }) =>
    request(app).post(`/manutencoes/${MAN}/documentos/${DOC}/recusar`).set(headers).send(corpo);

  it('marca o documento como recusado e devolve o chamado a "executado" para o prestador enviar outro', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_RETORNO' }));
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValueOnce(estado('AGUARDANDO_RETORNO')).mockResolvedValue(chamado({ status: 'EXECUTADO' }));
    prismaMock.documentoOS.updateMany.mockResolvedValue({ count: 1 });

    expect((await recusar()).status).toBe(200);

    expect(prismaMock.documentoOS.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: DOC, ordemServicoId: 'os1', recusadoEm: null },
      data: { motivoRecusa: 'Sem a assinatura do responsável' },
    });
    // a Unidade confirmou com base em documentos que mudaram: confirma de novo depois
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ status: 'EXECUTADO', aguardandoRetornoEm: null, confirmadoUnidade: false });
    expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'RECUSAR_DOCUMENTO_OS' });
  });

  it('documento com identificador que não é UUID dá 422 (e não erro interno)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_RETORNO' }));
    const res = await request(app).post(`/manutencoes/${MAN}/documentos/nao-e-uuid/recusar`).set(fiscal()).send({ motivo: 'Sem assinatura' });
    expect(res.status).toBe(422);
    expect(prismaMock.documentoOS.updateMany).not.toHaveBeenCalled();
  });

  it('já em "executado", só marca o documento (o status não muda)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValueOnce(estado('EXECUTADO')).mockResolvedValue(chamado());
    prismaMock.documentoOS.updateMany.mockResolvedValue({ count: 1 });
    expect((await recusar()).status).toBe(200);
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
  });

  it('documento inexistente ou já recusado dá 404; exige motivo e MANUTENCAO_FISCALIZAR; depois da aprovação final não recusa', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_RETORNO' }));
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(estado('AGUARDANDO_RETORNO'));
    prismaMock.documentoOS.updateMany.mockResolvedValue({ count: 0 });
    expect((await recusar()).status).toBe(404);
    expect((await recusar(fiscal(), { motivo: '' })).status).toBe(422);
    expect((await recusar(auth('OPERADOR', { permissoes: ['MANUTENCAO_AVALIAR'] }))).status).toBe(403);
    expect((await recusar(terc())).status).toBe(403);
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(estado('CONCLUIDA'));
    expect((await recusar()).status).toBe(422);
  });
});

describe('Valores escondidos do prestador', () => {
  const linhaCompleta = { id: 'l1', descricao: 'Troca de sifão', quantidade: '2', valorUnitario: '45', precoSinapi: '50', descontoPercentual: '10', codigoSinapi: '99001' };
  const completo = (extra: Record<string, unknown> = {}) =>
    chamado({
      status: 'EM_EXECUCAO',
      custoFinal: '500',
      linhasRelatorio: [linhaCompleta],
      contratoItem: { id: 'item-1', valor: '20000', descontoPercentual: '12', servico: { nome: 'Predial' } },
      ...extra,
    });

  it('o detalhe do chamado civil não traz preço, desconto, valor do item nem custo final para a terceirizada', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(completo());

    const res = await request(app).get(`/manutencoes/${MAN}`).set(terc());

    expect(res.status).toBe(200);
    expect(res.body.custoFinal).toBeNull();
    expect(res.body.contratoItem).toEqual({ id: 'item-1', servico: { nome: 'Predial' } });
    expect(res.body.linhasRelatorio[0]).toEqual({ id: 'l1', descricao: 'Troca de sifão', quantidade: '2', codigoSinapi: '99001' });
    expect(JSON.stringify(res.body)).not.toMatch(/valorUnitario|precoSinapi|descontoPercentual|20000/);
  });

  it('o administrativo continua vendo os valores', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(completo());
    const res = await request(app).get(`/manutencoes/${MAN}`).set(fiscal().Authorization ? auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] }) : fiscal());
    expect(res.body.custoFinal).toBe('500');
    expect(res.body.linhasRelatorio[0].valorUnitario).toBe('45');
    expect(res.body.contratoItem.valor).toBe('20000');
  });

  it('o erro de saldo na finalização não revela totais nem saldo ao prestador', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(completo());
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ ...completo(), linhasRelatorio: [{ ...linhaCompleta, quantidade: '1000', valorUnitario: '100' }] } as never);
    prismaMock.ordemServico.findUnique.mockResolvedValue({ id: 'os1' } as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue({ id: 'item-1', contratoId: 'ct-1', valor: 1000, contrato: { status: 'ATIVO' } } as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);

    const res = await request(app)
      .post(`/manutencoes/${MAN}/registrar-retorno`)
      .set(terc())
      .send({ entradaEm: '2026-11-05T09:00:00.000Z', saidaEm: '2026-11-05T11:00:00.000Z', resultado: 'TOTAL' });

    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/\d{2,}[.,]\d{2}|100000/);
    expect(res.body.mensagem).toMatch(/saldo/i);
  });
});

describe('Executado: dados da execução', () => {
  const retorno = (corpo: object) => request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terc()).send(corpo);
  const preparar = (ordem: unknown = { id: 'os1' }) => {
    const base = chamado({ status: 'EM_EXECUCAO', linhasRelatorio: [{ id: 'l1', quantidade: '1', valorUnitario: '100' }], motivoAjuste: null });
    prismaMock.manutencao.findUnique.mockResolvedValue(base);
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValueOnce(base).mockResolvedValue(chamado({ status: 'EXECUTADO' }));
    prismaMock.ordemServico.findUnique.mockResolvedValue(ordem as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue({ id: 'item-1', contratoId: 'ct-1', valor: 10000, contrato: { status: 'ATIVO' } } as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
  };
  const execucao = { entradaEm: '2026-11-05T09:00:00.000Z', saidaEm: '2026-11-05T11:30:00.000Z', resultado: 'PARCIAL', observacao: 'Faltou material' };

  it('guarda entrada, saída, resultado e observação na OS', async () => {
    preparar();
    expect((await retorno(execucao)).status).toBe(200);
    expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'EXECUTADO' });
    expect(prismaMock.ordemServico.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'os1' },
      data: { resultado: 'PARCIAL', observacaoExecucao: 'Faltou material', entradaEm: new Date(execucao.entradaEm), saidaEm: new Date(execucao.saidaEm) },
    });
  });

  it('exige a OS gerada, os dados da execução, saída depois da entrada e não no futuro', async () => {
    preparar(null);
    expect((await retorno(execucao)).status).toBe(422); // sem OS
    preparar();
    expect((await retorno({})).status).toBe(422); // sem dados
    preparar();
    expect((await retorno({ ...execucao, saidaEm: execucao.entradaEm })).status).toBe(422);
    preparar();
    expect((await retorno({ ...execucao, saidaEm: '2999-01-01T00:00:00.000Z' })).status).toBe(422);
    expect(prismaMock.ordemServico.update).not.toHaveBeenCalled();
  });
});
