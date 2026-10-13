import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const gestor = {
  '/auth/me': {
    body: {
      id: '1',
      nome: 'Gestora Teste',
      email: 'gestora@joinville.sc.gov.br',
      matricula: '10001',
      perfil: 'OPERADOR',
      unidadeId: null,
      unidadeNome: null,
    },
  },
  '/dashboard/alertas': { body: [] },
};

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
const usuario = {
  id: 'u2',
  nome: 'Rodrigo Unidade',
  email: 'rodrigo@joinville.sc.gov.br',
  matricula: '10003',
  perfil: 'UNIDADE',
  unidadeId: 'un1',
  unidadeNome: 'UBS Centro',
  ativo: true,
};

type Rota = { status?: number; body: unknown } | ((init?: RequestInit) => { status?: number; body: unknown });

// mockFetch usa a primeira rota cujo trecho aparece na URL: as específicas vêm antes
function rotas(extra: Record<string, Rota> = {}) {
  return mockFetch({
    ...extra,
    ...gestor,
    '/usuarios': { body: [usuario] },
    '/unidades': { body: [unidade] },
    ...extra,
  });
}

// Os campos ficam desabilitados enquanto os dados carregam
async function campo(rotulo: string) {
  const el = await screen.findByLabelText(rotulo);
  await waitFor(() => expect(el).toBeEnabled());
  return el;
}

function abrir(rota: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', rota);
  render(<App />);
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('Formulário de usuário', () => {
  it('cadastra um usuário exigindo unidade para o perfil Unidade', async () => {
    const chamadas = rotas();
    abrir('/configuracoes/usuarios/novo');

    await userEvent.type(await campo('Nome completo'), 'Maria Silva');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Matrícula'), '20001');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo1');
    expect(screen.getByLabelText('Unidade')).toBeRequired();
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'un1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/usuarios'));
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/usuarios'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      nome: 'Maria Silva',
      matricula: '20001',
      perfil: 'UNIDADE',
      unidadeId: 'un1',
    });
  });

  it('perfil de gestor não exige unidade', async () => {
    rotas();
    abrir('/configuracoes/usuarios/novo');

    await campo('Nome completo');
    await userEvent.selectOptions(screen.getByLabelText('Perfil de acesso'), 'OPERADOR');

    expect(screen.getByLabelText('Unidade')).not.toBeRequired();
  });

  it('edita o usuário sem reenviar e-mail nem matrícula e só redefine a senha se preenchida', async () => {
    const chamadas = rotas();
    abrir('/configuracoes/usuarios/u2');

    const nome = await screen.findByLabelText('Nome completo');
    await waitFor(() => expect(nome).toHaveValue('Rodrigo Unidade'));
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Matrícula')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inativo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/usuarios'));
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    const corpo = JSON.parse(String(patch?.init?.body));
    expect(patch?.url).toContain('/usuarios/u2');
    expect(corpo).toMatchObject({ ativo: false, perfil: 'UNIDADE', unidadeId: 'un1' });
    expect(corpo).not.toHaveProperty('senha');
    expect(corpo).not.toHaveProperty('email');
  });

  it('envia a nova senha quando preenchida', async () => {
    const chamadas = rotas();
    abrir('/configuracoes/usuarios/u2');

    const nome = await screen.findByLabelText('Nome completo');
    await waitFor(() => expect(nome).toHaveValue('Rodrigo Unidade'));
    await userEvent.type(screen.getByLabelText('Nova senha'), 'novasenha');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'PATCH')).toBe(true));
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body)).senha).toBe('novasenha');
  });

  it('mostra o erro da API e avisa quando o usuário não existe', async () => {
    rotas({ '/usuarios': (init) => (init?.method === 'POST' ? { status: 409, body: { mensagem: 'E-mail já cadastrado.' } } : { body: [usuario] }) });
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    abrir('/configuracoes/usuarios/novo');

    await userEvent.type(await campo('Nome completo'), 'Maria');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@joinville.sc.gov.br');
    await userEvent.type(screen.getByLabelText('Matrícula'), '1');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo1');
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), 'un1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(alerta).toHaveBeenCalledWith('E-mail já cadastrado.'));
  });

  it('usuário inexistente', async () => {
    rotas();
    abrir('/configuracoes/usuarios/zzz');

    expect(await screen.findByText('Usuário não encontrado.')).toBeInTheDocument();
  });
});

describe('Formulário de unidade', () => {
  it('cadastra uma unidade', async () => {
    const chamadas = rotas();
    abrir('/configuracoes/unidades/nova');

    await userEvent.type(await campo('Nome da unidade'), 'UPA Norte');
    await userEvent.type(screen.getByLabelText('Endereço'), 'Av. B, 20');
    await userEvent.type(screen.getByLabelText('E-mail'), 'norte@joinville.sc.gov.br');
    await userEvent.selectOptions(screen.getByLabelText('Responsável'), 'u2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/unidades'));
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/unidades'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      nome: 'UPA Norte',
      endereco: 'Av. B, 20',
      emailBase: 'norte@joinville.sc.gov.br',
      responsavelId: 'u2',
    });
  });

  it('edita e exclui a unidade com confirmação', async () => {
    const chamadas = rotas();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    abrir('/configuracoes/unidades/un1');

    const nome = await screen.findByLabelText('Nome da unidade');
    await waitFor(() => expect(nome).toHaveValue('UBS Centro'));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(chamadas.some((c) => c.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'DELETE' && c.url.includes('/unidades/un1'))).toBe(true));
    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/unidades'));
  });

  it('salva alterações enviando o estado ativo e mostra erro da API', async () => {
    const chamadas = rotas({
      '/unidades': (init) => (init?.method === 'PATCH' ? { status: 422, body: { mensagem: 'Nome inválido.' } } : { body: [unidade] }),
    });
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    abrir('/configuracoes/unidades/un1');

    const nome = await screen.findByLabelText('Nome da unidade');
    await waitFor(() => expect(nome).toHaveValue('UBS Centro'));
    await userEvent.type(nome, ' II');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(alerta).toHaveBeenCalledWith('Nome inválido.'));
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ nome: 'UBS Centro II', ativo: true });
  });

  it('unidade inexistente', async () => {
    rotas();
    abrir('/configuracoes/unidades/zzz');

    expect(await screen.findByText('Unidade não encontrada.')).toBeInTheDocument();
  });
});
