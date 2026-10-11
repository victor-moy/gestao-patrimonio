import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const gestor = {
  '/auth/me': {
    body: {
      id: '1',
      nome: 'Gestora Teste',
      email: 'gestora@joinville.sc.gov.br',
      matricula: '10001',
      perfil: 'GESTOR_PATRIMONIO',
      unidadeId: null,
      unidadeNome: null,
    },
  },
  '/dashboard/alertas': { body: [] },
};

const categorias = [{ id: 'c1', nome: 'Esterilização', descricao: null, tipos: [] }];
const tipo = {
  id: 't1',
  codigo: 'AUT-V50',
  nome: 'Autoclave vertical 50L',
  descricao: 'Uso hospitalar',
  imagemUrl: '/uploads/tipos/a.png',
  preco: '12500.00',
  categoriaId: 'c1',
  categoria: { nome: 'Esterilização' },
  quantidadeEquipamentos: 3,
};

function rotas(extra: Record<string, never | { status?: number; body: unknown } | ((i?: RequestInit) => { status?: number; body: unknown })> = {}) {
  // mockFetch usa a primeira rota cujo trecho aparece na URL: as específicas vêm antes
  return mockFetch({
    ...extra,
    ...gestor,
    '/categorias/tipos': { body: [tipo] },
    '/categorias': { body: categorias },
    ...extra,
  });
}

function abrir(rota: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', rota);
  render(<App />);
}

describe('Tipos de itens', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:previa');
  });
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('lista os tipos com categoria, preço e quantidade de equipamentos', async () => {
    rotas();
    abrir('/configuracoes/tipos');

    const link = await screen.findByRole('link', { name: 'Editar tipo Autoclave vertical 50L' });
    const linha = link.closest('tr')!;
    expect(within(linha).getByText('AUT-V50')).toBeInTheDocument();
    expect(within(linha).getByText('Esterilização')).toBeInTheDocument();
    expect(within(linha).getByText(/12\.500,00/)).toBeInTheDocument();
    expect(within(linha).getByText('3')).toBeInTheDocument();
  });

  it('mostra falha de carregamento da lista com nova tentativa', async () => {
    rotas({ '/categorias/tipos': { status: 500, body: { mensagem: 'Servidor indisponível' } } });
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    abrir('/configuracoes/tipos');

    await waitFor(() => expect(alerta).toHaveBeenCalledWith('Servidor indisponível'));
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('cadastra um tipo com imagem e envia a imagem depois de salvar', async () => {
    const chamadas = rotas({
      '/categorias/tipos': (init) =>
        init?.method === 'POST' ? { body: { ...tipo, id: 'novo' } } : { body: [tipo] },
    });
    abrir('/configuracoes/tipos/novo');

    const codigo = await screen.findByLabelText('Código');
    // os campos ficam desabilitados enquanto os dados carregam
    await waitFor(() => expect(codigo).toBeEnabled());
    await userEvent.type(codigo, 'RX-1');
    await userEvent.type(screen.getByLabelText('Nome do item'), 'Raio-X');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Esterilização' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Categoria'), 'c1');
    await userEvent.type(screen.getByLabelText('Preço de referência (R$)'), '100');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Digital');
    const arquivo = new File(['x'], 'raiox.png', { type: 'image/png' });
    await userEvent.upload(document.getElementById('tipo-imagem') as HTMLInputElement, arquivo);
    expect(screen.getByRole('button', { name: 'Trocar imagem do item' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/tipos'));
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/categorias/tipos'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      codigo: 'RX-1',
      nome: 'Raio-X',
      categoriaId: 'c1',
      preco: 100,
      descricao: 'Digital',
    });
    expect(chamadas.some((c) => c.url.includes('/categorias/tipos/novo/imagem'))).toBe(true);
  });

  it('edita um tipo existente e limpa o preço', async () => {
    const chamadas = rotas({ '/categorias/tipos/t1': { body: tipo } });
    abrir('/configuracoes/tipos/t1');

    const codigo = await screen.findByLabelText('Código');
    await waitFor(() => expect(codigo).toHaveValue('AUT-V50'));
    await userEvent.clear(screen.getByLabelText('Preço de referência (R$)'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/tipos'));
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body)).preco).toBeNull();
  });

  it('exclui o tipo só depois da confirmação e mostra erro da API', async () => {
    let tentativa = 0;
    const chamadas = rotas({
      '/categorias/tipos/t1': (init) => {
        if (init?.method !== 'DELETE') return { body: tipo };
        tentativa += 1;
        return tentativa === 1 ? { status: 409, body: { mensagem: 'Tipo em uso.' } } : { body: {} };
      },
    });
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    abrir('/configuracoes/tipos/t1');

    const excluir = await screen.findByRole('button', { name: 'Excluir' });
    await userEvent.click(excluir);
    expect(chamadas.some((c) => c.init?.method === 'DELETE')).toBe(false);

    await userEvent.click(excluir);
    await waitFor(() => expect(alerta).toHaveBeenCalledWith('Tipo em uso.'));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(window.location.pathname).toBe('/configuracoes/tipos'));
  });

  it('avisa quando o tipo não existe', async () => {
    rotas();
    abrir('/configuracoes/tipos/inexistente');

    expect(await screen.findByText('Tipo não encontrado.')).toBeInTheDocument();
  });
});
