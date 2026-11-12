import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';
import { caminhoRelato, telaDeOrigem } from '../utils/relato';

function usuarioLogado(perfil: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: { id: '1', nome: 'Ana Teste', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil, unidadeId: null, unidadeNome: null },
    },
  };
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

describe('Reportar bug — utilitários', () => {
  it('só aceita caminhos internos como tela de origem', () => {
    expect(telaDeOrigem('/solicitacoes/nova')).toBe('/solicitacoes/nova');
    expect(telaDeOrigem('https://exemplo.com')).toBe('/');
    expect(telaDeOrigem('//exemplo.com')).toBe('/');
    expect(telaDeOrigem('/reportar-bug?de=/x')).toBe('/');
    expect(telaDeOrigem(null)).toBe('/');
  });

  it('o link leva a tela atual, e já dentro do relato mantém a origem', () => {
    expect(caminhoRelato('/estoque', '?a=1')).toBe('/reportar-bug?de=%2Festoque%3Fa%3D1');
    expect(caminhoRelato('/reportar-bug', '?de=%2Festoque')).toBe('/reportar-bug?de=%2Festoque');
  });
});

describe('Reportar bug — envio', () => {
  it('o item do menu do usuário abre o formulário, que envia tela, texto e anexo e volta para a tela de origem', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('UNIDADE'),
      '/relatos': { status: 201, body: { id: 'r1' } },
    });
    window.history.pushState(null, '', '/inventario');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));
    await userEvent.click(screen.getByRole('link', { name: /Reportar bug/ }));

    expect(await screen.findByLabelText('Tela onde aconteceu')).toHaveValue('/inventario');
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();

    await userEvent.type(screen.getByLabelText('O que aconteceu de fato'), 'O botão salvar não responde');

    const print = new File([new Uint8Array(10)], 'print.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Escolher arquivos'), print);
    expect(screen.getByText('print.png')).toBeInTheDocument();
    await userEvent.click(enviar);

    await waitFor(() => expect(window.location.pathname).toBe('/inventario'));
    const envio = chamadas.find((c) => c.url.endsWith('/relatos') && c.init?.method === 'POST')!;
    const dados = envio.init!.body as FormData;
    expect(dados.get('tela')).toBe('/inventario');
    expect(dados.get('aconteceu')).toBe('O botão salvar não responde');
    expect((dados.getAll('anexos') as File[]).map((f) => f.name)).toEqual(['print.png']);
  });

  it('permite remover um anexo antes de enviar e recusa formato inválido', async () => {
    mockFetch({ ...usuarioLogado('UNIDADE'), '/relatos': { status: 201, body: { id: 'r1' } } });
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    window.history.pushState(null, '', '/reportar-bug?de=%2F');
    render(<App />);
    const escolher = await screen.findByLabelText('Escolher arquivos');
    await userEvent.upload(escolher, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }), { applyAccept: false });
    await userEvent.upload(escolher, new File([new Uint8Array(10)], 'b.exe', { type: 'application/x-msdownload' }), { applyAccept: false });
    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.queryByText('b.exe')).not.toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('b.exe'));
    await userEvent.click(screen.getByRole('button', { name: 'Remover a.png' }));
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
  });

  it('quem está sem acesso também consegue abrir o formulário', async () => {
    mockFetch({ ...usuarioLogado('SEM_ACESSO') });
    window.history.pushState(null, '', '/reportar-bug?de=%2F');
    render(<App />);
    expect(await screen.findByLabelText('O que aconteceu de fato')).toBeInTheDocument();
  });
});

describe('Relatos — lista do Administrador', () => {
  const relato = {
    id: 'r1',
    perfil: 'UNIDADE',
    tela: '/estoque',
    esperado: null,
    aconteceu: 'A tela do estoque ficou em branco',
    navegador: 'Chrome',
    anexos: [],
    status: 'ABERTO',
    criadoEm: '2026-11-12T15:00:00.000Z',
    atualizadoEm: '2026-11-12T15:00:00.000Z',
    usuario: { id: 'u2', nome: 'Rodrigo Unidade', email: 'rodrigo@joinville.sc.gov.br' },
  };

  it('lista os relatos e muda o status', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/relatos/r1/status': { body: { ...relato, status: 'RESOLVIDO' } },
      '/relatos/r1': { body: relato },
      '/relatos': { body: [relato] },
    });
    window.history.pushState(null, '', '/configuracoes/relatos');
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: /Abrir bug: A tela do estoque/ }));
    expect(await screen.findByText('Unidade de Atendimento · rodrigo@joinville.sc.gov.br')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'RESOLVIDO');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.url.endsWith('/relatos/r1/status') && c.init?.method === 'PATCH')).toBe(true),
    );
  });

  it('Unidade não entra na lista', async () => {
    mockFetch({ ...usuarioLogado('UNIDADE'), '/relatos': { body: [] } });
    window.history.pushState(null, '', '/configuracoes/relatos');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});
