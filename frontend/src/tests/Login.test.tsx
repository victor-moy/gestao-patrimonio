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

  it('mostra sempre a mesma mensagem quando o retorno do Keycloak falha', async () => {
    window.history.replaceState(null, '', '/login/retorno?erro=Usu%C3%A1rio%20desativado.');
    mockFetch({});
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Houve um erro na autenticação, tente novamente.');
    expect(localStorage.getItem('sgp_token')).toBeNull();
  });

  it('quem ainda não tem perfil vê a tela de acesso aguardando liberação', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    mockFetch({
      '/auth/me': {
        body: { id: '2', nome: 'Bia', email: 'bia@joinville.sc.gov.br', matricula: 'bia', perfil: 'SEM_ACESSO', unidadeId: null },
      },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Aguardando liberação' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Início/ })).not.toBeInTheDocument();
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
