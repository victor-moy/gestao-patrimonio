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

    const resultado = await expirarSolicitacoesPendentes();

    expect(resultado).toEqual({ expiradas: 1 });
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith({
      where: { id: 'sol-1' },
      data: { status: 'EXPIRADA' },
    });
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('não expira nenhuma solicitação quando não há atrasos', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    const resultado = await expirarSolicitacoesPendentes();
    expect(resultado).toEqual({ expiradas: 0 });
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });
});
