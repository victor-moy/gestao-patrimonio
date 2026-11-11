import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const ID = '99999999-9999-4999-8999-999999999999';

const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: ID,
    tipo: 'CIVIL',
    unidadeId: 'unidade-1',
    status: 'PENDENTE_APROVACAO',
    statusAntesBloqueio: null,
    motivoBloqueio: null,
    bloqueadoEm: null,
    tempoBloqueadoSegundos: 0,
    unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    ...extra,
  }) as never;

const triador = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_TRIAR'] });
const consulta = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR', 'MANUTENCAO_TRIAR'] });
const semPermissao = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_CONSULTAR'] });

describe('Bloqueio de chamado na triagem', () => {
  describe('POST /manutencoes/:id/bloquear', () => {
    const bloquear = (headers = triador(), corpo: object = { motivo: 'Aguardando a diretoria' }) =>
      request(app).post(`/manutencoes/${ID}/bloquear`).set(headers).send(corpo);

    it('bloqueia, guarda o status anterior e o motivo e audita', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_EXECUCAO' }));
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'BLOQUEADO' }));

      const res = await bloquear();

      expect(res.status).toBe(200);
      const { where, data } = prismaMock.manutencao.updateMany.mock.calls[0][0];
      // a condição de status na gravação recusa decisões concorrentes
      expect(where).toMatchObject({ id: ID, status: 'AGUARDANDO_EXECUCAO' });
      expect(data).toMatchObject({
        status: 'BLOQUEADO',
        statusAntesBloqueio: 'AGUARDANDO_EXECUCAO',
        motivoBloqueio: 'Aguardando a diretoria',
      });
      expect(data.bloqueadoEm).toBeInstanceOf(Date);
      expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'BLOQUEAR_MANUTENCAO', entidadeId: ID });
    });

    it.each(['EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO', 'CONCLUIDA', 'NEGADA', 'BLOQUEADO'])(
      'recusa bloquear chamado em %s',
      async (status) => {
        prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status }));
        expect((await bloquear()).status).toBe(422);
        expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
      },
    );

    it('exige o motivo', async () => {
      expect((await bloquear(triador(), { motivo: '  ' })).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('recusa quem não tem MANUTENCAO_TRIAR e a terceirizada', async () => {
      expect((await bloquear(semPermissao())).status).toBe(403);
      expect((await bloquear(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('recusa quando outra decisão mudou o status no meio (409)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 });
      expect((await bloquear()).status).toBe(409);
      expect(prismaMock.logAuditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /manutencoes/:id/desbloquear', () => {
    const desbloquear = (headers = triador()) => request(app).post(`/manutencoes/${ID}/desbloquear`).set(headers);

    it('volta ao status anterior e soma o tempo parado', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(
        chamado({
          status: 'BLOQUEADO',
          statusAntesBloqueio: 'AGUARDANDO_EXECUCAO',
          motivoBloqueio: 'x',
          bloqueadoEm: new Date(Date.now() - 3600 * 1000),
          tempoBloqueadoSegundos: 60,
        }),
      );
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ status: 'AGUARDANDO_EXECUCAO' }));

      expect((await desbloquear()).status).toBe(200);

      const { where, data } = prismaMock.manutencao.updateMany.mock.calls[0][0];
      expect(where).toMatchObject({ id: ID, status: 'BLOQUEADO' });
      expect(data).toMatchObject({ status: 'AGUARDANDO_EXECUCAO', statusAntesBloqueio: null, motivoBloqueio: null, bloqueadoEm: null });
      const incremento = (data.tempoBloqueadoSegundos as { increment: number }).increment;
      expect(incremento).toBeGreaterThanOrEqual(3599);
      expect(incremento).toBeLessThan(3700);
      expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'DESBLOQUEAR_MANUTENCAO' });
    });

    it('recusa chamado que não está bloqueado e quem não tem a permissão', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado());
      expect((await desbloquear()).status).toBe(422);
      expect((await desbloquear(semPermissao())).status).toBe(403);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('filtro "sem interação"', () => {
    it('lista só os chamados sem mensagem nem ação registrada depois da abertura', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
      prismaMock.manutencao.findMany.mockResolvedValue([]);

      const res = await request(app).get('/manutencoes?semInteracao=true').set(consulta());

      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({ id: { in: ['a', 'b'] } });
    });

    it('sem o parâmetro não consulta a auditoria nem restringe os ids', async () => {
      prismaMock.manutencao.findMany.mockResolvedValue([]);
      await request(app).get('/manutencoes').set(consulta());
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).not.toHaveProperty('id');
    });
  });
});
