import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function autenticarComo(perfil: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Usuária Teste',
        email: 'teste@joinville.sc.gov.br',
        matricula: '10003',
        perfil,
        unidadeId: null,
        unidadeNome: null,
      },
    },
  };
}

const rotasBase = {
  '/unidades': { body: [{ id: 'u1', nome: 'UBS Centro' }] },
  '/categorias': {
    body: [{ id: 'c1', nome: 'Mobiliário', tipos: [{ id: 't1', nome: 'Cadeira' }] }],
  },
  '/dashboard/alertas': { body: [] },
};

async function abrirInventario() {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /^Bem-vindo,/ })).toBeInTheDocument();
  });
  await userEvent.click(
    within(screen.getByRole('navigation')).getByRole('link', { name: /inventário/i }),
  );
  await screen.findByRole('heading', { name: 'Inventário' });
}

describe('Novo equipamento (UC02)', () => {
  it('abre uma página própria, cadastra e volta ao inventário com confirmação', async () => {
    const chamadas = mockFetch({
      ...autenticarComo('GESTOR_PATRIMONIO'),
      ...rotasBase,
      '/equipamentos': (init) =>
        init?.method === 'POST' ? { status: 201, body: { id: 'eq-9' } } : { body: [] },
    });
    await abrirInventario();

    await userEvent.click(screen.getByRole('link', { name: /novo equipamento/i }));
    expect(await screen.findByRole('heading', { name: 'Novo equipamento' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const cadastrar = screen.getByRole('button', { name: 'Salvar' });
    expect(cadastrar).toBeDisabled();

    await waitFor(() => expect(screen.getByLabelText(/unidade de destino/i)).toBeEnabled());
    await userEvent.type(screen.getByLabelText(/número de tombamento/i), '999/2026');
    await userEvent.selectOptions(screen.getByLabelText(/tipo de equipamento/i), 't1');
    await userEvent.selectOptions(screen.getByLabelText(/unidade de destino/i), 'u1');
    await userEvent.type(screen.getByLabelText(/descrição/i), 'Cadeira nova');
    await userEvent.click(cadastrar);

    expect(await screen.findByRole('heading', { name: 'Inventário' })).toBeInTheDocument();

    const post = chamadas.find((c) => c.init?.method === 'POST');
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      tombamento: '999/2026',
      tipoEquipamentoId: 't1',
      unidadeId: 'u1',
      dataAquisicao: null,
    });
  });

  it('mostra o erro da API e permanece na página', async () => {
    mockFetch({
      ...autenticarComo('GESTOR_PATRIMONIO'),
      ...rotasBase,
      '/equipamentos': (init) =>
        init?.method === 'POST'
          ? { status: 409, body: { mensagem: 'Tombamento já cadastrado.' } }
          : { body: [] },
    });
    await abrirInventario();
    await userEvent.click(screen.getByRole('link', { name: /novo equipamento/i }));
    await waitFor(() => expect(screen.getByLabelText(/unidade de destino/i)).toBeEnabled());
    await userEvent.type(screen.getByLabelText(/número de tombamento/i), '1/2026');
    await userEvent.selectOptions(screen.getByLabelText(/tipo de equipamento/i), 't1');
    await userEvent.selectOptions(screen.getByLabelText(/unidade de destino/i), 'u1');
    await userEvent.type(screen.getByLabelText(/descrição/i), 'Cadeira');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Tombamento já cadastrado.'));
    expect(screen.getByRole('heading', { name: 'Novo equipamento' })).toBeInTheDocument();
  });
});
