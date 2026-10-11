import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

describe('Sair', () => {
  afterEach(() => localStorage.clear());

  it('faz o app esmaecer antes de voltar para o login', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    mockFetch({
      '/auth/me': {
        body: { id: '1', nome: 'Ana', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil: 'UNIDADE', unidadeId: 'u1', unidadeNome: 'UBS' },
      },
      '/dashboard/alertas': { body: [] },
      '/conversas': { body: [] },
    });
    const { container } = render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));
    await userEvent.click(screen.getByRole('button', { name: /Sair/ }));

    // ainda na tela do app, já com a classe de saída
    expect(container.querySelector('.app-shell--saindo')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();

    // depois da animação, aparece o login e a sessão é encerrada
    expect(await screen.findByRole('button', { name: 'Entrar' }, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('sgp_token')).toBeNull());
  });
});

describe('Nome do sistema no topo', () => {
  afterEach(() => localStorage.clear());

  it('é um link que leva ao Início', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/inventario');
    mockFetch({
      '/equipamentos': { body: [] },
      '/auth/me': {
        body: { id: '1', nome: 'Ana', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil: 'UNIDADE', unidadeId: 'u1', unidadeNome: 'UBS' },
      },
      '/dashboard/alertas': { body: [] },
      '/conversas': { body: [] },
    });
    render(<App />);

    const link = await screen.findByRole('link', { name: /Gestão Patrimonial/ });
    expect(link).toHaveAttribute('href', '/');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: /Bem-vindo/ })).toBeInTheDocument();
  });
});
