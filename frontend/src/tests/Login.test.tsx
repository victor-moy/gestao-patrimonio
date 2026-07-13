import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

describe('Login (RF01)', () => {
  it('renderiza a tela de login institucional', () => {
    mockFetch({});
    render(<App />);
    expect(screen.getByText('Prefeitura de Joinville')).toBeInTheDocument();
    expect(screen.getByText('Sistema de Gestão de Patrimônio')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail *')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acessar sistema/i })).toBeInTheDocument();
    expect(screen.getByText('Acesso restrito a servidores autorizados')).toBeInTheDocument();
  });

  it('faz login e entra no painel gerencial do gestor', async () => {
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
      '/dashboard': {
        body: {
          totalEquipamentos: 280,
          emManutencao: 18,
          tempoMedioManutencaoDias: 12,
          custoMesAtual: 19400,
          custoSemestral: [],
          equipamentosPorUnidade: [],
          rankingSolicitacoes: [],
        },
      },
    });
    render(<App />);
    await userEvent.type(screen.getByLabelText('E-mail *'), 'gestor@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Senha *'), 'sgp12345');
    await userEvent.click(screen.getByRole('button', { name: /acessar sistema/i }));

    await waitFor(() => {
      expect(screen.getByText('Painel Gerencial')).toBeInTheDocument();
    });
    expect(screen.getByText('Total de Equipamentos')).toBeInTheDocument();
    expect(screen.getByText('280')).toBeInTheDocument();
    expect(localStorage.getItem('sgp_token')).toBe('token-teste');
  });

  it('exibe mensagem clara quando as credenciais são inválidas (RNF11)', async () => {
    mockFetch({
      '/auth/login': { status: 401, body: { mensagem: 'E-mail ou senha inválidos.' } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('E-mail *')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('E-mail *'), 'x@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Senha *'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /acessar sistema/i }));

    await waitFor(() => {
      expect(screen.getByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    });
  });
});
