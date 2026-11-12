import { prismaMock } from './prisma-mock';
import { resolverRetornosSemResposta } from '../src/jobs/resolverRetornosSemResposta.job';

const DIA = 24 * 60 * 60 * 1000;
const chamado = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    numero: 7,
    tipo: 'CIVIL',
    status: 'AGUARDANDO_MEDICAO',
    titulo: 'Infiltração',
    unidadeId: 'u1',
    unidade: { id: 'u1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
    contrato: null,
    ...extra,
  }) as never;

describe('Resolução automática do chamado civil sem resposta da Unidade', () => {
  it('busca só civis em AGUARDANDO_RETORNO parados há mais de 7 dias corridos', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    const antes = Date.now();

    expect(await resolverRetornosSemResposta()).toBe(0);

    const where = prismaMock.manutencao.findMany.mock.calls[0][0]?.where as {
      tipo: string;
      status: string;
      OR: Array<{ aguardandoRetornoEm: { lt: Date } | null; atualizadoEm?: { lt: Date } }>;
    };
    expect(where).toMatchObject({ tipo: 'CIVIL', status: 'AGUARDANDO_RETORNO' });
    const limite = (where.OR[0].aguardandoRetornoEm as { lt: Date }).lt.getTime();
    expect(antes - limite).toBeGreaterThanOrEqual(7 * DIA - 1000);
    expect(antes - limite).toBeLessThan(7 * DIA + 5000);
    // chamados anteriores à regra não têm a data: vale a última atualização
    expect(where.OR[1]).toMatchObject({ aguardandoRetornoEm: null });
    expect(where.OR[1].atualizadoEm?.lt).toBeInstanceOf(Date);
  });

  it('resolve: segue para a aprovação final do Administrador, audita sem usuário e avisa', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([{ id: 'c1' }] as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado());

    expect(await resolverRetornosSemResposta()).toBe(1);

    expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
      // a condição de status na gravação evita corrida com a resposta da Unidade
      where: { id: 'c1', tipo: 'CIVIL', status: 'AGUARDANDO_RETORNO' },
      data: { status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true },
    });
    const log = prismaMock.logAuditoria.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ acao: 'RESOLVER_AUTOMATICAMENTE', entidadeId: 'c1' });
    expect(log.usuarioId ?? null).toBeNull(); // ação do sistema, sem usuário
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('a Unidade respondeu no meio: nada muda, nem aviso', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([{ id: 'c1' }] as never);
    prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 });

    expect(await resolverRetornosSemResposta()).toBe(0);

    expect(prismaMock.logAuditoria.create).not.toHaveBeenCalled();
    expect(prismaMock.notificacao.create).not.toHaveBeenCalled();
  });

  it('a falha num chamado não impede os outros', async () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.manutencao.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as never);
    prismaMock.manutencao.updateMany.mockRejectedValueOnce(new Error('banco indisponível')).mockResolvedValueOnce({ count: 1 });
    prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(chamado({ id: 'c2' }));

    expect(await resolverRetornosSemResposta()).toBe(1);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
