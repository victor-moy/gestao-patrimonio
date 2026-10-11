import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const unidade = { id: 'u1', nome: 'UBS Centro' };
const equipamento = {
  id: 'e1',
  tombamento: '12345/2024',
  descricao: 'Autoclave Vertical 21L',
  estadoConservacao: 'BOM',
  status: 'ATIVO',
  emendaParlamentar: false,
  dataAquisicao: null,
  observacoes: null,
  tipoEquipamento: { id: 't1', codigo: 'AUT', nome: 'Autoclave Vertical', categoriaId: 'c1', categoria: { nome: 'Esterilização' } },
  unidade,
  movimentacoes: [],
  manutencoes: [],
};

function eu(perfil: string, unidadeId: string | null = 'u1') {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: { id: '1', nome: 'Ana', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil, unidadeId, unidadeNome: unidadeId ? 'UBS Centro' : null },
    },
    '/dashboard/alertas': { body: [] },
    '/conversas': { body: [] },
  };
}

afterEach(() => localStorage.clear());

describe('Botões de abrir chamado no detalhe do equipamento', () => {
  it('a unidade dona vê "Abrir manutenção" e "Abrir solicitação" já com o item', async () => {
    window.history.replaceState(null, '', '/inventario/e1');
    mockFetch({ '/equipamentos/e1': { body: equipamento }, ...eu('UNIDADE') });
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Abrir manutenção' })).toHaveAttribute('href', '/manutencoes/nova?equipamento=e1');
    expect(screen.getByRole('link', { name: 'Abrir solicitação' })).toHaveAttribute('href', '/solicitacoes/nova?equipamento=e1');
  });

  it.each([
    ['gestor de patrimônio', () => ({ ...eu('GESTOR_PATRIMONIO', null) }), equipamento],
    ['unidade que não é a dona', () => ({ ...eu('UNIDADE', 'u2') }), equipamento],
    ['equipamento baixado', () => ({ ...eu('UNIDADE') }), { ...equipamento, status: 'BAIXADO' }],
  ])('não oferece os botões para %s', async (_nome, perfil, dados) => {
    window.history.replaceState(null, '', '/inventario/e1');
    mockFetch({ '/equipamentos/e1': { body: dados }, ...perfil() });
    render(<App />);
    await screen.findByText('Tombamento 12345/2024');
    expect(screen.queryByRole('link', { name: 'Abrir manutenção' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir solicitação' })).not.toBeInTheDocument();
  });
});

describe('Formulários abertos a partir do item', () => {
  it('nova manutenção chega com o equipamento escolhido', async () => {
    window.history.replaceState(null, '', '/manutencoes/nova?equipamento=e1');
    mockFetch({
      '/equipamentos?status=ATIVO': { body: [equipamento] },
      '/configuracoes/atendimento': { body: { whatsapp: null } },
      ...eu('UNIDADE'),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Equipamento')).toBeEnabled());
    expect(screen.getByLabelText('Equipamento')).toHaveValue('e1');
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
  });

  it('nova manutenção não lista itens emprestados de outra unidade', async () => {
    window.history.replaceState(null, '', '/manutencoes/nova');
    const emprestado = { ...equipamento, id: 'e9', tombamento: '99999', unidade: { id: 'u9', nome: 'Outra UBS' } };
    mockFetch({
      '/equipamentos?status=ATIVO': { body: [equipamento, emprestado] },
      '/configuracoes/atendimento': { body: { whatsapp: null } },
      ...eu('UNIDADE'),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Equipamento')).toBeEnabled());
    expect(screen.getByRole('option', { name: /12345\/2024/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /99999/ })).not.toBeInTheDocument();
  });

  it('nova solicitação chega com o equipamento nos tipos que usam um item existente', async () => {
    window.history.replaceState(null, '', '/solicitacoes/nova?equipamento=e1');
    mockFetch({
      '/equipamentos?status=ATIVO': { body: [equipamento] },
      '/unidades': { body: [unidade] },
      '/categorias': { body: [] },
      '/configuracoes/atendimento': { body: { whatsapp: null } },
      ...eu('UNIDADE'),
    });
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'RECOLHA');
    await waitFor(() => expect(screen.getByLabelText('Item')).toHaveValue('e1'));
  });
});

describe('"Não encontrou o item?"', () => {
  function abrirManutencao(whatsapp: string | null) {
    window.history.replaceState(null, '', '/manutencoes/nova');
    mockFetch({
      '/equipamentos?status=ATIVO': { body: [equipamento] },
      '/configuracoes/atendimento': { body: { whatsapp } },
      ...eu('UNIDADE'),
    });
    render(<App />);
  }

  it('aparece com o link do WhatsApp quando o atendimento está configurado', async () => {
    abrirManutencao('5547999999999');
    const link = await screen.findByRole('link', { name: 'Fale com o atendimento' });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/5547999999999?text=')).toBe(true);
    expect(decodeURIComponent(href)).toContain('UBS Centro');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('some quando não há contato configurado', async () => {
    abrirManutencao(null);
    await waitFor(() => expect(screen.getByLabelText('Equipamento')).toBeEnabled());
    expect(screen.queryByText(/Não encontrou o item/)).not.toBeInTheDocument();
  });
});

describe('Configurações › Atendimento', () => {
  it('o Gestor de Patrimônio salva o WhatsApp', async () => {
    window.history.replaceState(null, '', '/configuracoes/atendimento');
    const chamadas = mockFetch({
      '/configuracoes/atendimento': (init) =>
        init?.method === 'PUT' ? { body: { whatsapp: '5547999999999' } } : { body: { whatsapp: null } },
      ...eu('GESTOR_PATRIMONIO', null),
    });
    render(<App />);

    const campo = await screen.findByLabelText('WhatsApp do atendimento');
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();
    await userEvent.type(campo, '47999999999');
    await userEvent.click(salvar);

    await waitFor(() => {
      const put = chamadas.find((c) => c.init?.method === 'PUT');
      expect(JSON.parse(String(put?.init?.body))).toEqual({ whatsapp: '47999999999' });
    });
    await waitFor(() => expect(screen.getByLabelText('WhatsApp do atendimento')).toHaveValue('(47) 99999-9999'));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('outros perfis não acessam', async () => {
    window.history.replaceState(null, '', '/configuracoes/atendimento');
    mockFetch({ ...eu('UNIDADE') });
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});
