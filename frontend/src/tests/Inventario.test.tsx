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
    tipoEquipamento: { id: 't1', codigo: 'AUT-V75', nome: 'Autoclave Vertical 75L', categoriaId: 'c1' },
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
    tipoEquipamento: { id: 't2', codigo: 'AUT-H100', nome: 'Autoclave Horizontal 100L', categoriaId: 'c1' },
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
      '/dashboard': { body: { totalEquipamentos: 0, emManutencao: 0, tempoMedioManutencaoDias: 0, custoMesAtual: 0, custoSemestral: [], equipamentosPorUnidade: [], rankingSolicitacoes: [] } },
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Painel Gerencial')).toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /cadastrar equipamento/i })).not.toBeInTheDocument();
  });
});
