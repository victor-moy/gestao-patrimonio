import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

describe('Login (RF01)', () => {
  it('renderiza a tela de login institucional', () => {
    mockFetch({});
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Acessar sua conta' })).toBeInTheDocument();
    expect(screen.getByText('Gestão Patrimonial')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /esqueceu a senha/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
    expect(screen.getByText(/em caso de dificuldade/i)).toBeInTheDocument();
  });

  it('faz login e entra na tela inicial do gestor', async () => {
    mockFetch({
      '/auth/login': {
        body: {
          token: 'token-teste',
          usuario: {
            id: '1',
            nome: 'Samuel',
            email: 'gestor@joinville.sc.gov.br',
            matricula: '10001',
            perfil: 'GESTOR_PATRIMONIO',
            unidadeId: null,
          },
        },
      },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'gestor@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Senha'), 'sgp12345');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Bem-vindo,/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Alertas importantes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mensagens não lidas' })).toBeInTheDocument();
    expect(localStorage.getItem('sgp_token')).toBe('token-teste');
  });

  it('exibe mensagem clara quando as credenciais são inválidas (RNF11)', async () => {
    mockFetch({
      '/auth/login': { status: 401, body: { mensagem: 'E-mail ou senha inválidos.' } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('E-mail'), 'x@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('E-mail ou senha inválidos.');
    });
  });
});
