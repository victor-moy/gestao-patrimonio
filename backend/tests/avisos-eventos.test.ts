import { prismaMock } from './prisma-mock';
import * as avisos from '../src/services/avisos.service';
import * as eventos from '../src/services/avisos.eventos';

describe('Eventos de avisos in-app', () => {
  it('criarAvisos grava um aviso por destinatário único', async () => {
    prismaMock.avisoUsuario.createMany.mockResolvedValue({ count: 2 } as never);
    await avisos.criarAvisos(['u1', 'u1', '', 'u2'], {
      tipo: 'SOLICITACAO_APROVADA',
      titulo: 'Aprovada',
      mensagem: 'SOL-0001',
      href: '/solicitacoes/s1',
      solicitacaoId: 's1',
    });
    expect(prismaMock.avisoUsuario.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ usuarioId: 'u1', solicitacaoId: 's1' }),
        expect.objectContaining({ usuarioId: 'u2', solicitacaoId: 's1' }),
      ],
    });
  });

  it('criarAvisos engole falha de persistência sem lançar', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.avisoUsuario.createMany.mockRejectedValue(new Error('db'));
    await expect(
      avisos.criarAvisos(['u1'], { tipo: 'X', titulo: 'T', mensagem: 'M' }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('avisoOrcamentoDecidido não notifica sem prestador', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 'op-1' }] as never);
    await eventos.avisoOrcamentoDecidido(
      { id: 'm1', numero: 1, unidadeId: 'uni-1', contrato: null },
      true,
    );
    expect(prismaMock.avisoUsuario.createMany).not.toHaveBeenCalled();
  });

  it('avisoOrcamentoDecidido aprovado avisa prestador e unidade', async () => {
    prismaMock.usuario.findMany
      .mockResolvedValueOnce([{ id: 'pre-user' }] as never)
      .mockResolvedValueOnce([{ id: 'uni-user' }] as never);
    prismaMock.avisoUsuario.createMany.mockResolvedValue({ count: 1 } as never);

    await eventos.avisoOrcamentoDecidido(
      {
        id: 'm1',
        numero: 7,
        unidadeId: 'uni-1',
        contrato: { prestadorId: 'pre-1' },
      },
      true,
    );

    expect(prismaMock.avisoUsuario.createMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.avisoUsuario.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [expect.objectContaining({ usuarioId: 'pre-user', tipo: 'ORCAMENTO_APROVADO' })],
      }),
    );
    expect(prismaMock.avisoUsuario.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [expect.objectContaining({ usuarioId: 'uni-user', tipo: 'ORCAMENTO_APROVADO_UNIDADE' })],
      }),
    );
  });

  it('avisoOrcamentoDecidido rejeitado avisa só o prestador', async () => {
    prismaMock.usuario.findMany.mockResolvedValue([{ id: 'pre-user' }] as never);
    prismaMock.avisoUsuario.createMany.mockResolvedValue({ count: 1 } as never);

    await eventos.avisoOrcamentoDecidido(
      {
        id: 'm1',
        numero: 7,
        unidadeId: 'uni-1',
        contrato: { prestadorId: 'pre-1' },
      },
      false,
    );

    expect(prismaMock.avisoUsuario.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.avisoUsuario.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ tipo: 'ORCAMENTO_REJEITADO' })],
      }),
    );
  });

  it('idsSeguros devolve lista vazia se a busca de destinatários falhar', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.usuario.findMany.mockRejectedValue(new Error('timeout'));
    await eventos.avisoOrcamentoRegistrado({ id: 'm1', numero: 3, unidadeId: 'uni-1' });
    expect(prismaMock.avisoUsuario.createMany).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
