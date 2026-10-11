import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function usuarioLogado(perfil: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Gestora Teste',
        email: 'gestora@joinville.sc.gov.br',
        matricula: '10001',
        perfil,
        unidadeId: null,
        unidadeNome: null,
      },
    },
  };
}

const outroUsuario = {
  id: 'u2',
  nome: 'Rodrigo Unidade',
  email: 'rodrigo@joinville.sc.gov.br',
  matricula: '10003',
  perfil: 'UNIDADE',
  unidadeId: 'un1',
  unidadeNome: 'UBS Centro',
  ativo: true,
};

describe('Configurações — entrar como outro usuário', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('gestor de patrimônio entra como outro usuário com um clique no ícone ao lado do nome', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/auth/impersonar/u2': {
        body: { token: 'token-u2', usuario: { ...outroUsuario } },
      },
      '/usuarios': { body: [outroUsuario] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    expect(screen.queryByRole('button', { name: 'Entrar como…' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar como Rodrigo Unidade' }));

    await waitFor(() =>
      expect(chamadas.some((c) => c.url.includes('/auth/impersonar/u2') && c.init?.method === 'POST')).toBe(true),
    );
    // "Redefinir usuário" fica no menu do usuário, acima de "Sair"
    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));
    const botoes = screen.getAllByRole('button').filter((b) => ['Redefinir usuário', 'Sair'].includes(b.textContent?.trim() ?? ''));
    expect(botoes.map((b) => b.textContent?.trim())).toEqual(['Redefinir usuário', 'Sair']);
    expect(window.location.pathname).toBe('/');
  });

  it('não oferece o ícone para usuários inativos nem para o próprio gestor', async () => {
    mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/usuarios': {
        body: [
          { ...outroUsuario, id: 'u3', nome: 'Paula Inativa', ativo: false },
          { ...outroUsuario, id: '1', nome: 'Gestora Teste', perfil: 'GESTOR_PATRIMONIO' },
        ],
      },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    await screen.findByRole('link', { name: 'Editar usuário Paula Inativa' });
    expect(screen.queryByRole('button', { name: /Entrar como/ })).not.toBeInTheDocument();
  });

  it('outros perfis não acessam a tela', async () => {
    mockFetch({
      ...usuarioLogado('UNIDADE'),
      '/usuarios': { body: [] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('button', { name: /Entrar como/ })).not.toBeInTheDocument();
  });

  it('erro ao entrar aparece no alerta nativo', async () => {
    mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/auth/impersonar/u2': { status: 404, body: { mensagem: 'Usuário não encontrado ou inativo.' } },
      '/usuarios': { body: [outroUsuario] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar como Rodrigo Unidade' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Usuário não encontrado ou inativo.'));
  });
});

describe('Configurações — cadastros em páginas', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  const unidade = {
    id: 'un1',
    nome: 'UBS Centro',
    tipo: 'UBSF',
    endereco: 'Rua A, 10',
    emailBase: 'centro@joinville.sc.gov.br',
    responsavelId: 'u2',
    responsavel: { id: 'u2', nome: 'Rodrigo Unidade' },
    ativo: true,
  };

  it('lista usuários, filtra por status e mostra o submenu', async () => {
    const inativo = { ...outroUsuario, id: 'u3', nome: 'Paula Inativa', email: 'paula@joinville.sc.gov.br', ativo: false };
    mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/usuarios': { body: [outroUsuario, inativo] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Editar usuário Rodrigo Unidade' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tipos de itens' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Todos/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Inativos' }));
    expect(screen.queryByRole('link', { name: 'Editar usuário Rodrigo Unidade' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar usuário Paula Inativa' })).toBeInTheDocument();
  });

  it('cadastra uma unidade em página própria', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/unidades': { body: [] },
      '/usuarios': { body: [outroUsuario] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/unidades/nova');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('Nome da unidade'), 'UBS Aventureiro');
    await userEvent.type(screen.getByLabelText('Endereço'), 'Rua B, 20');
    await userEvent.type(screen.getByLabelText('E-mail'), 'aventureiro@joinville.sc.gov.br');
    await userEvent.selectOptions(await screen.findByLabelText('Responsável'), 'u2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.endsWith('/unidades') && c.init?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        nome: 'UBS Aventureiro',
        tipo: 'UBSF',
        responsavelId: 'u2',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Unidades' })).toBeInTheDocument();
  });

  it('edita e exclui uma unidade com confirmação', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('GESTOR_PATRIMONIO'),
      '/unidades/un1': { body: {} },
      '/unidades': { body: [unidade] },
      '/usuarios': { body: [outroUsuario] },
      '/dashboard/alertas': { body: [] },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '/configuracoes/unidades/un1');
    render(<App />);

    expect(await screen.findByDisplayValue('UBS Centro')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.url.endsWith('/unidades/un1') && c.init?.method === 'DELETE')).toBe(true),
    );
    expect(await screen.findByRole('heading', { name: 'Unidades' })).toBeInTheDocument();
  });

  it('perfis sem acesso são redirecionados ao início', async () => {
    mockFetch({ ...usuarioLogado('GESTOR_MANUTENCAO'), '/dashboard/alertas': { body: [] } });
    window.history.replaceState(null, '', '/configuracoes/tipos');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Configurações' })).not.toBeInTheDocument();
  });
});
