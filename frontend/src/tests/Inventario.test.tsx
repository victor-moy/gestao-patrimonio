import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function autenticarComo(perfil: string, unidadeId: string | null = null) {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Usuária Teste',
        email: 'teste@joinville.sc.gov.br',
        matricula: '10003',
        perfil,
        unidadeId,
        unidadeNome: unidadeId ? 'UBS Centro' : null,
      },
    },
  };
}

const equipamentos = [
  {
    id: 'eq-1',
    tombamento: '12345/2024',
    descricao: 'Autoclave Vertical 75L',
    estadoConservacao: 'BOM',
    status: 'ATIVO',
    emendaParlamentar: false,
    dataAquisicao: '2024-01-14T00:00:00.000Z',
    observacoes: null,
    tipoEquipamento: {
      id: 't1',
      codigo: 'AUT-V75',
      nome: 'Autoclave Vertical 75L',
      categoriaId: 'c1',
    },
    unidade: { id: 'u1', nome: 'UBS Centro' },
    unidadeTemporaria: null,
  },
  {
    id: 'eq-2',
    tombamento: '12346/2024',
    descricao: 'Autoclave Horizontal 100L',
    estadoConservacao: 'REGULAR',
    status: 'EM_MANUTENCAO',
    emendaParlamentar: true,
    dataAquisicao: '2023-06-09T00:00:00.000Z',
    observacoes: null,
    tipoEquipamento: {
      id: 't2',
      codigo: 'AUT-H100',
      nome: 'Autoclave Horizontal 100L',
      categoriaId: 'c1',
    },
    unidade: { id: 'u2', nome: 'UBS Norte' },
    unidadeTemporaria: null,
  },
];

describe('Inventário (UC03/UC04)', () => {
  it('lista equipamentos com status, conservação e flag de emenda', async () => {
    mockFetch({
      ...autenticarComo('GESTOR_PATRIMONIO'),
      '/equipamentos': { body: equipamentos },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
      '/dashboard/alertas': { body: [] },
      '/dashboard': {
        body: {
          totalEquipamentos: 0,
          emManutencao: 0,
          tempoMedioManutencaoDias: 0,
          custoMesAtual: 0,
          custoSemestral: [],
          equipamentosPorUnidade: [],
          rankingSolicitacoes: [],
        },
      },
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Bem-vindo,/ })).toBeInTheDocument();
    });
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: /inventário/i }),
    );
    await waitFor(() => {
      expect(screen.getByText('Inventário de Equipamentos')).toBeInTheDocument();
      expect(screen.getByText('12345/2024')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Em Manutenção').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Regular').length).toBeGreaterThan(0);
    expect(screen.getByText('Emenda')).toBeInTheDocument();
    expect(screen.getByText('2 equipamentos')).toBeInTheDocument();
    // Gestor vê botões de importação e cadastro
    expect(screen.getByRole('button', { name: /importar csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cadastrar equipamento/i })).toBeInTheDocument();
  });

  it('unidade não vê botões de cadastro/importação (leitura apenas)', async () => {
    mockFetch({
      ...autenticarComo('UNIDADE', 'u1'),
      '/equipamentos': { body: [equipamentos[0]] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/bem-vindo/i)).toBeInTheDocument();
    });
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: /inventário/i }),
    );
    await waitFor(() => {
      expect(screen.getByText('12345/2024')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /importar csv/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /cadastrar equipamento/i }),
    ).not.toBeInTheDocument();
  });
});

it('pagina os resultados e reinicia a página ao filtrar por status', async () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({
    ...equipamentos[0],
    id: `eq-${i}`,
    tombamento: `PAT-${String(i + 1).padStart(3, '0')}`,
  }));
  const chamadas = mockFetch({
    ...autenticarComo('GESTOR_PATRIMONIO'),
    '/equipamentos?status=EM_MANUTENCAO': { body: [equipamentos[1]] },
    '/equipamentos': { body: lista },
    '/unidades': { body: [] },
    '/categorias': { body: [] },
  });
  window.history.replaceState(null, '', '/inventario');
  render(<App />);
  await screen.findByText('PAT-001');
  expect(screen.queryByText('PAT-011')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
  expect(screen.getByText('PAT-011')).toBeInTheDocument();
  expect(screen.queryByText('PAT-001')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Em manutenção' }));
  await screen.findByText('12346/2024');
  expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filtrar por status' })).toHaveValue('EM_MANUTENCAO');
  expect(chamadas.some((c) => c.url.endsWith('/equipamentos?status=EM_MANUTENCAO'))).toBe(true);
});

it('mantém status adicionais, combina busca e unidade e permite limpar filtros vazios', async () => {
  const chamadas = mockFetch({
    ...autenticarComo('GESTOR_PATRIMONIO'),
    '/equipamentos?busca=xyz': { body: [] },
    '/equipamentos': { body: equipamentos },
    '/unidades': { body: [{ id: 'u1', nome: 'UBS Centro' }] },
    '/categorias': { body: [] },
  });
  window.history.replaceState(null, '', '/inventario');
  render(<App />);
  await screen.findByText('12345/2024');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Filtrar por status' }),
    'CEDIDO',
  );
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Filtrar por unidade' }),
    'u1',
  );
  await userEvent.type(screen.getByRole('textbox', { name: 'Buscar equipamentos' }), 'xyz');
  await screen.findByText('Nenhum equipamento encontrado');
  expect(
    chamadas.some((c) => c.url.endsWith('/equipamentos?busca=xyz&unidadeId=u1&status=CEDIDO')),
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  await screen.findByText('12345/2024');
  expect(screen.getByRole('textbox', { name: 'Buscar equipamentos' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Filtrar por unidade' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Todos os bens' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('distingue falha de consulta de inventário vazio e permite tentar novamente', async () => {
  let falhar = true;
  mockFetch({
    ...autenticarComo('GESTOR_PATRIMONIO'),
    '/equipamentos': () =>
      falhar ? { status: 500, body: { mensagem: 'Falha temporária' } } : { body: equipamentos },
    '/unidades': { body: [] },
    '/categorias': { body: [] },
  });
  window.history.replaceState(null, '', '/inventario');
  render(<App />);
  await screen.findByText('Não foi possível carregar o inventário.');
  expect(screen.queryByText('Nenhum equipamento encontrado')).not.toBeInTheDocument();
  falhar = false;
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('12345/2024');
  expect(screen.queryByText('Falha temporária')).not.toBeInTheDocument();
});
