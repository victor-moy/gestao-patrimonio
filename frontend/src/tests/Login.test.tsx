import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setToken } from '../api/client';
import { mockFetch } from './mock-fetch';
import { irParaLoginInstitucional } from '../utils/navegacao';

vi.mock('../utils/navegacao', () => ({
  recarregarNoInicio: vi.fn(),
  encerrarSessaoInstitucional: vi.fn(),
  irParaLoginInstitucional: vi.fn(),
}));

describe('Login institucional (Keycloak)', () => {
  afterEach(() => {
    setToken(null);
    window.history.replaceState(null, '', '/');
    vi.mocked(irParaLoginInstitucional).mockClear();
  });

  it('sem sessão não há tela de login: mostra só o carregando e segue direto ao Keycloak', async () => {
    mockFetch({});
    render(<App />);
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gestão Patrimonial' })).not.toBeInTheDocument();
    await waitFor(() => expect(irParaLoginInstitucional).toHaveBeenCalledWith('/api'));
    expect(screen.getByRole('status')).toHaveTextContent('Carregando');
  });

  it('se o login falhou, mostra o erro com "Tentar novamente" e não redireciona sozinho (sem ciclo)', async () => {
    window.history.replaceState(null, '', '/?erro=login');
    mockFetch({});
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar');
    expect(screen.getByRole('link', { name: 'Tentar novamente' })).toHaveAttribute('href', '/api/auth/oidc/login');
    expect(irParaLoginInstitucional).not.toHaveBeenCalled();
  });

  it('token vencido (401) leva a um novo login; erro do servidor mostra a falha em vez de repetir o login', async () => {
    localStorage.setItem('sgp_token', 'vencido');
    mockFetch({ '/auth/me': { status: 401, body: { mensagem: 'Sessão expirada' } } });
    const primeira = render(<App />);
    await waitFor(() => expect(irParaLoginInstitucional).toHaveBeenCalledWith('/api'));
    primeira.unmount();

    vi.mocked(irParaLoginInstitucional).mockClear();
    localStorage.setItem('sgp_token', 'valido');
    mockFetch({ '/auth/me': { status: 500, body: { mensagem: 'Erro interno' } } });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar');
    expect(irParaLoginInstitucional).not.toHaveBeenCalled();
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

  it('voltar ao login sem token em /login/retorno limpa o endereço e segue ao Keycloak de novo', async () => {
    window.history.replaceState(null, '', '/login/retorno');
    mockFetch({});
    render(<App />);
    await waitFor(() => expect(irParaLoginInstitucional).toHaveBeenCalled());
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
