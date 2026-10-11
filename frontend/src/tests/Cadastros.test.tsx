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
  empresa: 'Tecnomed',
  cnpj: null,
  tipo: 'Manutenção Preventiva',
  objeto: 'Manutenção de autoclaves',
  valorTotal: '12000',
  condicoesPagamento: '30 dias',
  status: 'ATIVO',
  observacoes: null,
  vigenciaInicio: '2026-01-01T00:00:00.000Z',
  vigenciaFim: '2026-12-31T00:00:00.000Z',
  ativo: true,
};

afterEach(() => vi.restoreAllMocks());

describe('Atas', () => {
  it('lista com situação e saldo baixo e filtra pela visualização', async () => {
    mockFetch({ ...entrarComo('GESTOR_PATRIMONIO', '/atas'), '/atas': { body: [ataAtiva, ataVencida] } });
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
      ...entrarComo('GESTOR_PATRIMONIO', '/atas'),
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
      ...entrarComo('GESTOR_PATRIMONIO', '/atas/a1'),
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

  it('só o Gestor de Patrimônio acessa atas', async () => {
    mockFetch({ ...entrarComo('GESTOR_MANUTENCAO', '/atas'), '/atas': { body: [ataAtiva] } });
    render(<App />);
    await screen.findByRole('heading', { name: /bem-vindo/i });
    expect(screen.queryByRole('heading', { name: 'Atas' })).not.toBeInTheDocument();
    const menu = within(screen.getByRole('navigation'));
    expect(menu.queryByRole('link', { name: 'Atas' })).not.toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Contratos' })).toBeInTheDocument();
  });
});

describe('Contratos', () => {
  it('lista os contratos e filtra por status', async () => {
    mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/contratos'),
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

  it('cadastra um contrato em página própria', async () => {
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/contratos'),
      '/contratos': (init) => (init?.method === 'POST' ? { status: 201, body: {} } : { body: [] }),
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Novo contrato' }));
    expect(await screen.findByRole('heading', { name: 'Novo contrato' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Número do contrato'), 'CONT-2026-777');
    await userEvent.type(screen.getByLabelText('Fornecedor'), 'Tecnomed');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de contrato'), 'Calibração');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Calibração anual');
    await userEvent.type(screen.getByLabelText('Condições de pagamento'), '30 dias');
    await userEvent.type(screen.getByLabelText('Início da vigência'), '2026-01-01');
    await userEvent.type(screen.getByLabelText('Término da vigência'), '2026-12-31');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('heading', { name: 'Contratos' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/contratos'));
    expect(JSON.parse(String(post?.init?.body))).toMatchObject({
      numero: 'CONT-2026-777',
      tipo: 'Calibração',
      status: 'ATIVO',
    });
  });

  it('só o Gestor de Patrimônio exclui, e com confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_PATRIMONIO', '/contratos/c1'),
      '/contratos/c1': { body: {} },
      '/contratos': { body: [contrato] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Contratos' })).toBeInTheDocument();
    expect(chamadas.some((c) => c.init?.method === 'DELETE' && c.url.endsWith('/contratos/c1'))).toBe(true);
  });

  it('o Gestor de Manutenção edita mas não vê a exclusão', async () => {
    mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/contratos/c1'),
      '/contratos': { body: [contrato] },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Contrato CONT-2026-001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });
});
