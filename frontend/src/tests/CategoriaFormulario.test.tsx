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

const categoria = { id: 'c1', nome: 'Esterilização', descricao: 'Autoclaves', tipos: [] };

function abrir(rota: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', rota);
  render(<App />);
}

describe('Formulário de categoria de itens', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('cria uma categoria e volta para a lista', async () => {
    const chamadas = mockFetch({ ...gestor, '/categorias': { body: [categoria] } });
    abrir('/configuracoes/itens/categorias/nova');

    const salvar = await screen.findByRole('button', { name: /salvar|criar|cadastrar/i });
    expect(salvar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nome da categoria'), 'Imagem');
    await userEvent.click(salvar);

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/itens/categorias'));
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/categorias'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ nome: 'Imagem', descricao: null });
  });

  it('edita uma categoria existente', async () => {
    const chamadas = mockFetch({ ...gestor, '/categorias': { body: [categoria] } });
    abrir('/configuracoes/itens/categorias/c1');

    const nome = await screen.findByLabelText('Nome da categoria');
    await waitFor(() => expect(nome).toHaveValue('Esterilização'));
    await userEvent.clear(screen.getByLabelText('Descrição'));
    await userEvent.type(screen.getByLabelText('Descrição'), 'Autoclaves e seladoras');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/itens/categorias'));
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    expect(patch?.url).toContain('/categorias/c1');
    expect(JSON.parse(String(patch?.init?.body)).descricao).toBe('Autoclaves e seladoras');
  });

  it('exclui somente depois da confirmação', async () => {
    const chamadas = mockFetch({ ...gestor, '/categorias': { body: [categoria] } });
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    abrir('/configuracoes/itens/categorias/c1');

    const excluir = await screen.findByRole('button', { name: 'Excluir' });
    await userEvent.click(excluir);
    expect(chamadas.some((c) => c.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(excluir);
    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'DELETE')).toBe(true));
    expect(confirmar).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/itens/categorias'));
  });

  it('avisa quando a categoria não existe', async () => {
    mockFetch({ ...gestor, '/categorias': { body: [categoria] } });
    abrir('/configuracoes/itens/categorias/inexistente');

    expect(await screen.findByText('Categoria não encontrada.')).toBeInTheDocument();
  });

  it('mostra o erro devolvido pela API ao salvar', async () => {
    mockFetch({
      ...gestor,
      '/categorias': (init) =>
        init?.method === 'POST' ? { status: 409, body: { mensagem: 'Categoria já existe.' } } : { body: [] },
    });
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    abrir('/configuracoes/itens/categorias/nova');

    await userEvent.type(await screen.findByLabelText('Nome da categoria'), 'Imagem');
    await userEvent.click(screen.getByRole('button', { name: /salvar|criar|cadastrar/i }));

    await waitFor(() => expect(alerta).toHaveBeenCalledWith('Categoria já existe.'));
  });
});
