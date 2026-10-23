import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { setToken } from '../api/client';
import { mockFetch } from './mock-fetch';

describe('Login institucional (Keycloak)', () => {
  afterEach(() => {
    setToken(null);
    window.history.replaceState(null, '', '/');
  });

  it('oferece o login institucional como caminho principal', () => {
    mockFetch({});
    render(<App />);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/api/auth/oidc/login');
  });

  it('guarda o token do fragmento ao voltar do Keycloak e limpa o endereço', async () => {
    window.history.replaceState(null, '', '/login/retorno#token=token-keycloak');
    mockFetch({
      '/auth/me': {
        body: { id: '1', nome: 'Ana', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil: 'UNIDADE', unidadeId: 'u1', unidadeNome: 'UBS' },
      },
      '/dashboard/alertas': { body: [] },
      '/conversas': { body: [] },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: /Bem-vindo/ })).toBeInTheDocument();
    expect(localStorage.getItem('sgp_token')).toBe('token-keycloak');
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('');
  });

  it('voltar ao login sem token em /login/retorno limpa o endereço e mostra a mesma tela de sempre', async () => {
    window.history.replaceState(null, '', '/login/retorno');
    mockFetch({});
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(localStorage.getItem('sgp_token')).toBeNull();
  });

  it('quem ainda não tem perfil cai na tela inicial, só com o menu Início', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/inventario');
    mockFetch({
      '/auth/me': {
        body: { id: '2', nome: 'Bia Lima', email: 'bia@joinville.sc.gov.br', matricula: 'bia', perfil: 'SEM_ACESSO', unidadeId: null },
      },
      '/dashboard/alertas': { body: [] },
      '/avisos': { body: { itens: [], total: 0 } },
      '/conversas': { body: [] },
      '/conversas/nao-lidas': { body: { total: 0 } },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bem-vindo, Bia' })).toBeInTheDocument();
    expect(screen.queryByText(/acesso ainda não foi liberado/)).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('link', { name: 'Início' })).toBeInTheDocument();
    for (const name of ['Inventário', 'Solicitações', 'Estoque', 'Atas', 'Contratos', 'Relatórios', 'Conversas', 'Configurações']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});

describe('Tela de login (RF01)', () => {
  it('só oferece a conta institucional: sem campos de e-mail e senha', () => {
    mockFetch({});
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Gestão Patrimonial' })).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    expect(screen.queryByText(/contingência/i)).not.toBeInTheDocument();
    expect(screen.getByText(/em caso de dificuldade/i)).toBeInTheDocument();
  });
});
