import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function entrarComo(perfil: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', '/estoque');
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Samuel',
        email: 'samuel@joinville.sc.gov.br',
        matricula: '10001',
        perfil,
        unidadeId: null,
        unidadeNome: null,
      },
    },
  };
}

const galpao = { id: 'g1', nome: 'Galpão CIAD', tipo: 'GALPAO' };
const categoria = { nome: 'Esterilização', cor: '#2563eb' };
const item = (id: string, nome: string, quantidade: number, reservado = 0) => ({
  id,
  quantidade,
  reservado,
  ultimaEntradaEm: null,
  unidade: galpao,
  tipoEquipamento: { id: `t-${id}`, nome, codigo: `COD-${id}`, categoria },
});
const itens = [item('1', 'Autoclave 21L', 8), item('2', 'Autoclave 75L', 2, 1), item('3', 'Centrífuga', 0)];

async function abrirFiltroPorStatus(rotulo: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: rotulo }));
}

describe('Estoque', () => {
  it('lista os itens do galpão com status e filtra pela visualização', async () => {
    mockFetch({
      ...entrarComo('GESTOR_PATRIMONIO'),
      '/unidades': { body: [galpao, { id: 'u1', nome: 'UBS Centro', tipo: 'UBS' }] },
      '/estoque': { body: itens },
    });
    render(<App />);

    expect(await screen.findByText('Autoclave 21l')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Estoque' })).toBeInTheDocument();
    expect(screen.getByText('Estoque coberto')).toBeInTheDocument();
    expect(screen.getAllByText('Estoque baixo').length).toBeGreaterThan(0);
    expect(screen.getByText('Estoque zero')).toBeInTheDocument();
    expect(screen.getByText('3 equipamentos')).toBeInTheDocument();

    await abrirFiltroPorStatus('Zero');
    expect(screen.getByText('Centrífuga')).toBeInTheDocument();
    expect(screen.queryByText('Autoclave 21l')).not.toBeInTheDocument();
    expect(screen.getByText('1 equipamento')).toBeInTheDocument();
  });

  it('oferece nova tentativa quando o carregamento falha', async () => {
    let falhar = true;
    mockFetch({
      ...entrarComo('GALPAO'),
      '/unidades': { body: [galpao] },
      '/estoque': () => (falhar ? { status: 500, body: { mensagem: 'Falha temporária' } } : { body: itens }),
    });
    render(<App />);

    expect(await screen.findByText('Não foi possível carregar o estoque.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum item cadastrado no estoque')).not.toBeInTheDocument();
    falhar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Autoclave 21l')).toBeInTheDocument();
  });

  it('movimenta como entrada em página própria e volta à lista com a confirmação', async () => {
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_PATRIMONIO'),
      '/estoque/entrada': { status: 201, body: {} },
      '/unidades': { body: [galpao] },
      '/categorias': {
        body: [{ id: 'c1', nome: 'Esterilização', tipos: [{ id: 't-1', nome: 'Autoclave 21L', codigo: 'COD-1' }] }],
      },
      '/estoque': { body: itens },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Movimentar Autoclave 21l' }));
    expect(await screen.findByRole('heading', { name: 'Movimentar estoque' })).toBeInTheDocument();
    // O formulário só aparece depois de escolher o tipo da movimentação
    expect(screen.queryByLabelText('Quantidade')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'entrada');
    expect(screen.queryByLabelText('Unidade de destino')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Tipo de item')).toBeEnabled());
    // O item e o galpão vêm preenchidos pela linha clicada
    expect(screen.getByLabelText('Tipo de item')).toHaveValue('t-1');
    expect(screen.getByLabelText('Galpão')).toHaveValue('g1');

    await userEvent.clear(screen.getByLabelText('Quantidade'));
    await userEvent.type(screen.getByLabelText('Quantidade'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Estoque' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Estoque' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.url.endsWith('/estoque/entrada'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      tipoEquipamentoId: 't-1',
      quantidade: 5,
      unidadeId: 'g1',
    });
  });

  it('ao escolher saída pede a unidade de destino e mostra o erro da API', async () => {
    mockFetch({
      ...entrarComo('GESTOR_PATRIMONIO'),
      '/estoque/saida': { status: 422, body: { mensagem: 'Saldo insuficiente em estoque.' } },
      '/unidades': { body: [galpao, { id: 'u1', nome: 'UBS Centro', tipo: 'UBS' }] },
      '/categorias': {
        body: [{ id: 'c1', nome: 'Esterilização', tipos: [{ id: 't-1', nome: 'Autoclave 21L', codigo: 'COD-1' }] }],
      },
      '/estoque': { body: itens },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Movimentar Autoclave 21l' }));
    expect(await screen.findByRole('heading', { name: 'Movimentar estoque' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'saida');
    await waitFor(() => expect(screen.getByLabelText('Unidade de destino')).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText('Unidade de destino'), 'u1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Saldo insuficiente em estoque.'));
    expect(screen.getByRole('heading', { name: 'Movimentar estoque' })).toBeInTheDocument();
  });

  it('perfis sem acesso ao estoque não abrem a página de movimentação', async () => {
    mockFetch({
      ...entrarComo('UNIDADE'),
      '/unidades': { body: [galpao] },
      '/dashboard/alertas': { body: [] },
    });
    window.history.replaceState(null, '', '/estoque/movimentar');
    render(<App />);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Movimentar estoque' })).not.toBeInTheDocument());
    expect(within(document.body).queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
