import { render, screen, waitFor, within } from '@testing-library/react';
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

describe('Configurações — acesso', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
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
      ...usuarioLogado('OPERADOR'),
      '/usuarios': { body: [outroUsuario, inativo] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios');
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Editar usuário Rodrigo Unidade' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Itens' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Todos/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Inativos' }));
    expect(screen.queryByRole('link', { name: 'Editar usuário Rodrigo Unidade' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar usuário Paula Inativa' })).toBeInTheDocument();
  });

  it('cadastra uma unidade em página própria', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
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
      ...usuarioLogado('OPERADOR'),
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

  it('o status da unidade é um seletor Ativa/Inativa e vai no PATCH', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/unidades/un1': { body: {} },
      '/unidades': { body: [unidade] },
      '/usuarios': { body: [outroUsuario] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/unidades/un1');
    render(<App />);

    const status = await screen.findByRole('combobox', { name: 'Status' });
    expect(status).toHaveValue('ativo');
    await userEvent.selectOptions(status, 'inativo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const patch = chamadas.find((c) => c.url.endsWith('/unidades/un1') && c.init?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(String(patch!.init!.body))).toMatchObject({ ativo: false });
    });
  });

  it('perfis sem acesso são redirecionados ao início', async () => {
    mockFetch({ ...usuarioLogado('UNIDADE'), '/dashboard/alertas': { body: [] } });
    window.history.replaceState(null, '', '/configuracoes/itens/tipos');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Configurações' })).not.toBeInTheDocument();
  });
});

describe('Prestadores de serviço e serviços de contrato', () => {
  it('cadastra um prestador em página própria', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/prestadores': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/servicos/prestadores/novo');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('Nome da empresa'), 'TecSaúde Ltda.');
    await userEvent.type(screen.getByLabelText('CNPJ'), '12345678000190');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.endsWith('/prestadores') && c.init?.method === 'POST');
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        nome: 'TecSaúde Ltda.',
        cnpj: '12345678000190',
        telefone: null,
        email: null,
      });
    });
    expect(await screen.findByRole('heading', { name: 'Prestadores de serviço' })).toBeInTheDocument();
  });

  it('cadastra um tipo de serviço e o menu Serviços mostra seus submenus de Configurações', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/servicos-contrato': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/servicos/tipos/novo');
    render(<App />);

    // Menu Serviços aberto com seus submenus
    const submenu = await screen.findByRole('group', { name: 'Submenus de Serviços' });
    expect(within(submenu).getByRole('link', { name: 'Prestadores' })).toBeInTheDocument();
    expect(within(submenu).getByRole('link', { name: 'Tipos' })).toBeInTheDocument();
    expect(within(submenu).getByRole('link', { name: 'Escopos' })).toBeInTheDocument();
    await userEvent.type(
      await screen.findByLabelText('Nome do tipo de serviço'),
      'Serviço de manutenção preventiva e corretiva',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.endsWith('/servicos-contrato') && c.init?.method === 'POST');
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        nome: 'Serviço de manutenção preventiva e corretiva',
        descricao: null,
      });
    });
    expect(await screen.findByRole('heading', { name: 'Tipos de serviço' })).toBeInTheDocument();
  });

  it('cadastra um escopo', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/escopos-servico': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/servicos/escopos/novo');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('Nome do escopo'), 'Preventiva');
    const coberta = screen.getByLabelText('Manutenção coberta');
    expect(within(coberta).queryByRole('option', { name: 'Nenhuma' })).not.toBeInTheDocument();
    await userEvent.selectOptions(coberta, 'Preventiva');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.endsWith('/escopos-servico') && c.init?.method === 'POST');
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({
        nome: 'Preventiva',
        descricao: null,
        cobrePreventiva: true,
        cobreCorretiva: false,
      });
    });
    expect(await screen.findByRole('heading', { name: 'Escopos de serviço' })).toBeInTheDocument();
  });

  it('na lista de escopos, "Novo escopo" e o nome do escopo abrem as telas certas', async () => {
    mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/escopos-servico': {
        body: [{ id: 'es1', nome: 'Preventiva', descricao: null, cobrePreventiva: true, cobreCorretiva: false, _count: { itens: 0 } }],
      },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/servicos/escopos');
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Novo escopo' })).toHaveAttribute('href', '/configuracoes/servicos/escopos/novo');
    await userEvent.click(await screen.findByRole('link', { name: 'Editar escopo Preventiva' }));
    expect(await screen.findByLabelText('Nome do escopo')).toHaveValue('Preventiva');
    expect(window.location.pathname).toBe('/configuracoes/servicos/escopos/es1');
  });

  it('usuário terceirizado exige o prestador de serviço', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      '/unidades': { body: [] },
      '/usuarios': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
      '/prestadores': {
        body: [{ id: 'pr1', nome: 'TecSaúde', cnpj: null, telefone: null, email: null, _count: { contratos: 1 } }],
      },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/configuracoes/usuarios/novo');
    render(<App />);

    await userEvent.type(await screen.findByLabelText('E-mail'), 'tec@tecsaude.com.br');
    expect(screen.queryByLabelText('Prestador de serviço')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Perfil de acesso'), 'TERCEIRIZADA');
    await screen.findByRole('option', { name: 'TecSaúde' });
    await userEvent.selectOptions(screen.getByLabelText('Prestador de serviço'), 'pr1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.endsWith('/usuarios') && c.init?.method === 'POST');
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({ perfil: 'TERCEIRIZADA', prestadorId: 'pr1' });
    });
  });

  it.each([
    ['escopo', '/configuracoes/servicos/escopos/es1', '/escopos-servico', 'Nome do escopo', 'Escopos de serviço'],
    ['tipo de serviço', '/configuracoes/servicos/tipos/sv1', '/servicos-contrato', 'Nome do tipo de serviço', 'Tipos de serviço'],
    ['prestador', '/configuracoes/servicos/prestadores/pr1', '/prestadores', 'Nome da empresa', 'Prestadores de serviço'],
  ])('edita e exclui um %s com confirmação e volta à lista', async (_nome, caminho, rota, rotuloCampo, tituloLista) => {
    const id = caminho.split('/').at(-1)!;
    const item = { id, nome: 'Cadastro X', descricao: null, cnpj: null, telefone: null, email: null, cobrePreventiva: true, cobreCorretiva: true, _count: { itens: 0, contratos: 0 } };
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR'),
      [`${rota}/${id}`]: { body: {} },
      [rota]: { body: [item] },
      '/dashboard/alertas': { body: [] },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', caminho);
    render(<App />);

    const campo = await screen.findByLabelText(rotuloCampo);
    await waitFor(() => expect(campo).toHaveValue('Cadastro X'));
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Cadastro Y');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      const patch = chamadas.find((c) => c.init?.method === 'PATCH' && c.url.endsWith(`${rota}/${id}`));
      expect(JSON.parse(String(patch!.init!.body))).toMatchObject({ nome: 'Cadastro Y' });
    });
    expect(await screen.findByRole('heading', { name: tituloLista })).toBeInTheDocument();

    window.history.replaceState(null, '', caminho);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('"Cadastro X"'));
    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'DELETE' && c.url.endsWith(`${rota}/${id}`))).toBe(true));
  });

  it('um cadastro inexistente mostra o aviso e não permite salvar', async () => {
    mockFetch({ ...usuarioLogado('OPERADOR'), '/escopos-servico': { body: [] }, '/dashboard/alertas': { body: [] } });
    window.history.replaceState(null, '', '/configuracoes/servicos/escopos/nao-existe');
    render(<App />);
    expect(await screen.findByText('Cadastro não encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });
});
