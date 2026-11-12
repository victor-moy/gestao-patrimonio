import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const MAN = '99999999-9999-4999-8999-999999999999';
const ITEM = '66666666-6666-4666-8666-666666666666';
const OUTRO_ITEM = '55555555-5555-4555-8555-555555555555';

const avaliador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_AVALIAR'] });
const triador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_TRIAR'] });
const vistoriador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_VISTORIAR'] });
const sem = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] });

const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: MAN,
    numero: 7,
    tipo: 'CIVIL',
    unidadeId: 'unidade-1',
    status: 'AGUARDANDO_AVALIACAO_TECNICA',
    contratoItemId: ITEM,
    titulo: 'Infiltração',
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    contrato: null,
    ...extra,
  }) as never;

const gravar = (count = 1) => prismaMock.manutencao.updateMany.mockResolvedValue({ count });
const ultimaGravacao = () => prismaMock.manutencao.updateMany.mock.calls[0][0];
const acaoAuditada = () => prismaMock.logAuditoria.create.mock.calls.map((c) => c[0].data.acao);

describe('Saídas da avaliação técnica', () => {
  describe('devolver avaliado à triagem (fila "já avaliados")', () => {
    const devolver = (headers = avaliador(), corpo: object = { parecer: 'Pode seguir com o prestador' }) =>
      request(app).post(`/manutencoes/${MAN}/devolver-avaliado`).set(headers).send(corpo);

    it('muda para AVALIADO guardando o parecer, mantém o item e avisa a triagem', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      gravar();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'AVALIADO' }));

      const res = await devolver();

      expect(res.status).toBe(200);
      expect(ultimaGravacao()).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
        data: { status: 'AVALIADO', parecerTecnico: 'Pode seguir com o prestador' },
      });
      expect(ultimaGravacao().data).not.toHaveProperty('contratoItemId');
      expect(acaoAuditada()).toEqual(['DEVOLVER_AVALIADO_A_TRIAGEM']);
    });

    it('exige parecer, item de contrato e a permissão de avaliar', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      expect((await devolver(avaliador(), { parecer: '' })).status).toBe(422);
      expect((await devolver(triador())).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ contratoItemId: null }));
      expect((await devolver()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('recusa quando a avaliação já mudou de situação (409)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      gravar(0);
      expect((await devolver()).status).toBe(409);
      expect(prismaMock.logAuditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('triador encaminha o chamado avaliado ao prestador', () => {
    const encaminhar = (corpo: object = {}, headers = triador()) =>
      request(app).post(`/manutencoes/${MAN}/encaminhar-avaliado`).set(headers).send(corpo);
    const preparar = (extra: Record<string, unknown> = {}) => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AVALIADO', ...extra }));
      prismaMock.contratoItem.findUnique.mockResolvedValue({ id: ITEM, contratoId: 'ct-1', valor: 1000, contrato: { status: 'ATIVO' } } as never);
      prismaMock.$queryRaw.mockResolvedValue([] as never);
    };

    it('vai ao prestador (civil: aguardando execução) com o contrato do item e audita', async () => {
      preparar();
      gravar();
      prismaMock.manutencao.findUnique.mockResolvedValueOnce(chamado({ status: 'AVALIADO' })).mockResolvedValueOnce(chamado({ status: 'AGUARDANDO_EXECUCAO' }));

      const res = await encaminhar();

      expect(res.status).toBe(200);
      expect(ultimaGravacao()).toMatchObject({
        where: { id: MAN, status: 'AVALIADO' },
        data: { status: 'AGUARDANDO_EXECUCAO', contratoItemId: ITEM, contratoId: 'ct-1' },
      });
      expect(acaoAuditada()).toEqual(['ENCAMINHAR_CHAMADO_AVALIADO']);
    });

    it('o triador pode trocar o item de contrato', async () => {
      preparar();
      prismaMock.contratoItem.findUnique.mockResolvedValue({ id: OUTRO_ITEM, contratoId: 'ct-2', valor: 1000, contrato: { status: 'ATIVO' } } as never);
      gravar();
      prismaMock.manutencao.findUnique.mockResolvedValueOnce(chamado({ status: 'AVALIADO' })).mockResolvedValueOnce(chamado({ status: 'AGUARDANDO_EXECUCAO' }));

      expect((await encaminhar({ contratoItemId: OUTRO_ITEM })).status).toBe(200);
      expect(ultimaGravacao().data).toMatchObject({ contratoItemId: OUTRO_ITEM, contratoId: 'ct-2' });
    });

    it.each(['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AGUARDANDO_EXECUCAO'])('recusa chamado em %s', async (status) => {
      preparar({ status });
      expect((await encaminhar()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('só quem tem MANUTENCAO_TRIAR; a avaliação não encaminha por esta rota', async () => {
      preparar();
      expect((await encaminhar({}, avaliador())).status).toBe(403);
      expect((await encaminhar({}, sem())).status).toBe(403);
      expect((await encaminhar({}, auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
    });
  });

  describe('solicitar informações (volta à triagem)', () => {
    const pedir = (headers = avaliador(), corpo: object = { motivo: 'Qual o andar da infiltração?' }) =>
      request(app).post(`/manutencoes/${MAN}/solicitar-informacoes`).set(headers).send(corpo);

    it('volta a PENDENTE_APROVACAO com o motivo e sem o item (a triagem escolhe de novo)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      gravar();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'PENDENTE_APROVACAO' }));

      expect((await pedir()).status).toBe(200);

      expect(ultimaGravacao()).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
        data: { status: 'PENDENTE_APROVACAO', informacoesSolicitadas: 'Qual o andar da infiltração?', contratoItemId: null },
      });
      expect(acaoAuditada()).toEqual(['SOLICITAR_INFORMACOES_AVALIACAO']);
    });

    it('exige o motivo, a permissão e o status de avaliação', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      expect((await pedir(avaliador(), { motivo: ' ' })).status).toBe(422);
      expect((await pedir(triador())).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_EXECUCAO' }));
      expect((await pedir()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('vistoria', () => {
    it('marcar vistoria tira o chamado da avaliação sem mandá-lo ao prestador', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      gravar();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'AGUARDANDO_VISTORIA' }));

      const res = await request(app).post(`/manutencoes/${MAN}/marcar-vistoria`).set(avaliador());

      expect(res.status).toBe(200);
      expect(ultimaGravacao()).toMatchObject({ where: { status: 'AGUARDANDO_AVALIACAO_TECNICA' }, data: { status: 'AGUARDANDO_VISTORIA' } });
      expect(ultimaGravacao().data).not.toHaveProperty('contratoId');
      expect(acaoAuditada()).toEqual(['MARCAR_VISTORIA']);
    });

    const registrar = (headers = vistoriador(), corpo: object = { parecer: 'Infiltração vem da calha' }) =>
      request(app).post(`/manutencoes/${MAN}/registrar-vistoria`).set(headers).send(corpo);

    it('registrar o parecer da vistoria devolve o chamado à avaliação', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_VISTORIA' }));
      gravar();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado());

      expect((await registrar()).status).toBe(200);

      expect(ultimaGravacao()).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_VISTORIA' },
        data: { status: 'AGUARDANDO_AVALIACAO_TECNICA', parecerVistoria: 'Infiltração vem da calha' },
      });
      expect(acaoAuditada()).toEqual(['REGISTRAR_VISTORIA']);
    });

    it('quem vistoria (ou avalia) registra; os demais não; fora de vistoria é recusado', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_VISTORIA' }));
      gravar();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado());
      expect((await registrar(avaliador())).status).toBe(200);
      expect((await registrar(triador())).status).toBe(403);
      expect((await registrar(sem())).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      expect((await registrar()).status).toBe(422);
    });

    it('chamado em vistoria ou avaliado não é encerrado nem editado como se estivesse em avaliação', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_VISTORIA' }));
      const editar = await request(app).patch(`/manutencoes/${MAN}/avaliacao`).set(avaliador()).send({ titulo: 'Novo' });
      expect(editar.status).toBe(422);
    });
  });

  it('o triador aprovando de novo limpa o pedido de informações', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'PENDENTE_APROVACAO', informacoesSolicitadas: 'Qual o andar?', contratoItemId: null }));
    prismaMock.contratoItem.findUnique.mockResolvedValue({ id: ITEM, contratoId: 'ct-1', valor: 1000, contrato: { status: 'ATIVO' }, servico: { exigeAvaliacaoTecnica: true } } as never);
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    prismaMock.manutencao.update.mockResolvedValue(chamado({ status: 'AGUARDANDO_AVALIACAO_TECNICA' }));

    const res = await request(app).post(`/manutencoes/${MAN}/aprovar`).set(triador()).send({ contratoItemId: ITEM });

    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ status: 'AGUARDANDO_AVALIACAO_TECNICA', informacoesSolicitadas: null });
  });
});
