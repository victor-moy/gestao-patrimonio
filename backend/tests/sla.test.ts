import { prismaMock } from './prisma-mock';
import { expirarSolicitacoesPendentes } from '../src/jobs/expirarSolicitacoes.job';

const solicitacaoAntiga = {
  id: 'sol-1',
  status: 'PENDENTE_APROVACAO',
  criadoEm: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  atualizadoEm: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
  unidadeOrigem: { nome: 'UBS Sul', emailBase: 'sul@jlle.gov' },
};

describe('Job de expiração de solicitações por SLA (7 dias sem retorno)', () => {
  it('expira solicitações paradas há mais de 7 dias e notifica origem + gestores', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([solicitacaoAntiga] as never);
    prismaMock.usuario.findMany.mockResolvedValue([{ email: 'gestor@jlle.gov' }] as never);
    prismaMock.avisoUsuario.deleteMany.mockResolvedValue({ count: 4 } as never);

    const resultado = await expirarSolicitacoesPendentes();

    expect(resultado).toEqual({ expiradas: 1, avisosPurgados: 4 });
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith({
      where: { id: 'sol-1' },
      data: { status: 'EXPIRADA' },
    });
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
    expect(prismaMock.avisoUsuario.deleteMany).toHaveBeenCalledWith({
      where: { lidaEm: { not: null, lt: expect.any(Date) } },
    });
  });

  it('não expira nenhuma solicitação quando não há atrasos, mas ainda purga avisos lidos', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    prismaMock.avisoUsuario.deleteMany.mockResolvedValue({ count: 0 } as never);
    const resultado = await expirarSolicitacoesPendentes();
    expect(resultado).toEqual({ expiradas: 0, avisosPurgados: 0 });
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
    expect(prismaMock.avisoUsuario.deleteMany).toHaveBeenCalled();
  });
});
