import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function entrarComo(perfil: string, caminho: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', caminho);
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Usuário Teste',
        email: 'teste@joinville.sc.gov.br',
        matricula: '10001',
        perfil,
        unidadeId: null,
        unidadeNome: null,
      },
    },
    '/dashboard/alertas': { body: [] },
  };
}

const daqui = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

const ataAtiva = {
  id: 'a1',
  numero: '045/2026',
  fornecedor: 'MedEquip',
  descricao: 'Ata de registro de preços',
  valorTotal: '100000',
  saldo: '5000',
  vencimento: daqui(200),
  unidadeEspecifica: null,
  ativo: true,
};
const ataVencida = { ...ataAtiva, id: 'a2', numero: '010/2025', fornecedor: 'Velha SA', saldo: '90000', vencimento: daqui(-10) };

const contrato = {
  id: 'c1',
  numero: 'CONT-2026-001',
  prestadorId: 'pr1',
  prestador: { id: 'pr1', nome: 'Tecnomed' },
  objeto: 'Manutenção de autoclaves',
  valorTotal: '12000',
  status: 'ATIVO',
  itens: [
    {
      id: 'i1',
      servicoId: 'sv1',
      valor: '12000',
      escopoId: 'es3',
      servico: { id: 'sv1', nome: 'Serviço de manutenção preventiva e corretiva' },
      saldo: 12000,
      escopo: { id: 'es3', nome: 'Preventiva e corretiva', cobrePreventiva: true, cobreCorretiva: true },
    },
  ],
  vigenciaInicio: '2026-01-01T00:00:00.000Z',
  vigenciaFim: '2026-12-31T00:00:00.000Z',
  ativo: true,
};

const prestadores = [{ id: 'pr1', nome: 'Tecnomed', cnpj: null, telefone: null, email: null, _count: { contratos: 1 } }];
const servicos = [
  { id: 'sv1', nome: 'Serviço de manutenção preventiva e corretiva', descricao: null, _count: { itens: 1 } },
  { id: 'sv2', nome: 'Serviço de calibração', descricao: null, _count: { itens: 0 } },
];
const escopos = ['Preventiva', 'Corretiva', 'Preventiva e corretiva'].map((nome, n) => ({
  id: `es${n + 1}`,
  nome,
  descricao: null,
  _count: { itens: 0 },
}));
const catalogos = {
  '/escopos-servico': { body: escopos },
  '/prestadores': { body: prestadores },
  '/servicos-contrato': { body: servicos },
};

afterEach(() => vi.restoreAllMocks());

describe('Atas', () => {
  it('lista com situação e saldo baixo e filtra pela visualização', async () => {
    mockFetch({ ...entrarComo('OPERADOR', '/atas'), '/atas': { body: [ataAtiva, ataVencida] } });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Atas' })).toBeInTheDocument();
    expect(await screen.findByText('045/2026')).toBeInTheDocument();
    expect(screen.getByText('Saldo baixo')).toBeInTheDocument();
    expect(screen.getByText('2 atas')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Vencidas' }));
    expect(screen.getByText('010/2025')).toBeInTheDocument();
    expect(screen.queryByText('045/2026')).not.toBeInTheDocument();
  });

  it('cadastra uma ata em página própria e volta à lista com a confirmação', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/atas'),
      '/atas': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
      '/unidades': { body: [{ id: 'u1', nome: 'UBS Centro', tipo: 'UBSF' }] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Nova ata' }));
    expect(await screen.findByRole('heading', { name: 'Nova ata' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeDisabled();

    await waitFor(() => expect(screen.getByLabelText('Fornecedor')).toBeEnabled());
    await userEvent.type(screen.getByLabelText('Número da ata'), '099/2026');
    await userEvent.type(screen.getByLabelText('Fornecedor'), 'MedEquip');
    await userEvent.type(screen.getByLabelText('Valor total (R$)'), '5000');
    await userEvent.type(screen.getByLabelText('Vencimento'), '2027-01-31');
    await userEvent.click(salvar);

    expect(await screen.findByRole('heading', { name: 'Atas' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/atas'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      numero: '099/2026',
      fornecedor: 'MedEquip',
      valorTotal: 5000,
      vencimento: '2027-01-31',
      unidadeEspecificaId: null,
    });
  });

  it('edita uma ata mantendo o número fixo', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/atas/a1'),
      '/atas/a1': { body: {} },
      '/atas': { body: [ataAtiva] },
      '/unidades': { body: [] },
    });
    render(<App />);

    const numero = await screen.findByLabelText('Número da ata');
    await waitFor(() => expect(numero).toHaveValue('045/2026'));
    expect(numero).toBeDisabled();
    const fornecedor = screen.getByLabelText('Fornecedor');
    await userEvent.clear(fornecedor);
    await userEvent.type(fornecedor, 'Nova Empresa');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Atas' })).toBeInTheDocument();
    const patch = chamadas.find((c) => c.init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ fornecedor: 'Nova Empresa', valorTotal: 100000 });
  });

  it('só o Administrador acessa atas: Unidade não vê o menu nem a tela', async () => {
    mockFetch({ ...entrarComo('UNIDADE', '/atas'), '/atas': { body: [ataAtiva] } });
    render(<App />);
    await screen.findByRole('heading', { name: /bem-vindo/i });
    expect(screen.queryByRole('heading', { name: 'Atas' })).not.toBeInTheDocument();
    const menu = within(screen.getByRole('navigation'));
    expect(menu.queryByRole('link', { name: 'Atas' })).not.toBeInTheDocument();
    expect(menu.queryByRole('link', { name: 'Contratos' })).not.toBeInTheDocument();
  });

});

describe('Contratos', () => {
  it('lista os contratos e filtra por status', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/contratos'),
      ...catalogos,
      '/contratos': { body: [contrato, { ...contrato, id: 'c2', numero: 'CONT-2025-009', status: 'EXPIRADO' }] },
    });
    render(<App />);

    expect(await screen.findByText('CONT-2026-001')).toBeInTheDocument();
    expect(screen.getByText('2 contratos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Expirado' }));
    expect(screen.getByText('CONT-2025-009')).toBeInTheDocument();
    expect(screen.queryByText('CONT-2026-001')).not.toBeInTheDocument();
  });

  it('a lista de contratos segue o padrão das atas: prestador sob o número, saldo, uso e vencimento', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/contratos'),
      '/contratos': {
        body: [
          { ...contrato, itens: [{ ...contrato.itens[0], saldo: 3000 }] },
          { ...contrato, id: 'c9', numero: 'CONT-ANTIGO', valorTotal: '500', itens: [] },
        ],
      },
    });
    render(<App />);

    const linha = (await screen.findByRole('link', { name: 'Editar contrato CONT-2026-001' })).closest('tr')!;
    expect(within(linha).getByText('Tecnomed')).toBeInTheDocument();
    expect(within(linha).getByText(/12\.000,00/)).toBeInTheDocument();
    expect(within(linha).getByText(/3\.000,00/)).toBeInTheDocument();
    expect(within(linha).getByLabelText('75% do saldo utilizado')).toBeInTheDocument();
    expect(within(linha).getByText(/\d{2}\/12\/2026/)).toBeInTheDocument();
    expect(within(linha).getByText('Ativo')).toBeInTheDocument();
    // contrato antigo, sem itens: sem saldo nem uso
    const antigo = screen.getByRole('link', { name: 'Editar contrato CONT-ANTIGO' }).closest('tr')!;
    expect(within(antigo).getAllByText('—')).toHaveLength(2);
  });

  it('cadastra um contrato em página própria', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/contratos'),
      ...catalogos,
      '/contratos': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Novo contrato' }));
    expect(await screen.findByRole('heading', { name: 'Novo contrato' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Número do contrato'), 'CONT-2026-777');
    await screen.findByRole('option', { name: 'Tecnomed' });
    await screen.findByRole('option', { name: 'Corretiva' });
    await userEvent.selectOptions(screen.getByLabelText('Prestador de serviço'), 'pr1');
    expect(screen.queryByLabelText('Tipo de contrato')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Condições de pagamento')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Observações')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Equipamento')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Descrição'), 'Calibração anual');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de serviço'), 'sv1');
    await userEvent.selectOptions(screen.getByLabelText('Escopo'), 'es2');
    await userEvent.type(screen.getByLabelText('Valor do item (R$)'), '1500.50');
    await userEvent.click(screen.getByRole('button', { name: '+ Adicionar item' }));
    const linha2 = screen.getByRole('group', { name: 'Item 2' });
    await userEvent.selectOptions(within(linha2).getByLabelText('Tipo de serviço'), 'sv2');
    await userEvent.selectOptions(within(linha2).getByLabelText('Escopo'), 'es3');
    await userEvent.type(within(linha2).getByLabelText('Valor do item (R$)'), '500');
    expect(screen.getByText(/2\.000,50/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover item 2' }));
    expect(screen.getByText(/1\.500,50/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Início da vigência'), '2026-01-01');
    await userEvent.type(screen.getByLabelText('Término da vigência'), '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Contratos' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/contratos'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      numero: 'CONT-2026-777',
      status: 'ATIVO',
      prestadorId: 'pr1',
      itens: [{ servicoId: 'sv1', valor: 1500.5, escopoId: 'es2' }],
    });
    expect(JSON.parse(String(post?.init?.body))).not.toHaveProperty('tipo');
  });

  it('o Administrador exclui, e com confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/contratos/c1'),
      ...catalogos,
      '/contratos/c1': { body: {} },
      '/contratos': { body: [contrato] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Contratos' })).toBeInTheDocument();
    expect(chamadas.some((c) => c.init?.method === 'DELETE' && c.url.endsWith('/contratos/c1'))).toBe(true);
  });
});
