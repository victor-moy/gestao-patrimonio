import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const me = {
  '/auth/me': {
    body: {
      id: '1',
      nome: 'Anderson Viebranz',
      email: 'gestor@joinville.sc.gov.br',
      matricula: '10001',
      perfil: 'GESTOR_PATRIMONIO',
      unidadeId: null,
      unidadeNome: null,
    },
  },
};

const dashboardVazio = {
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
};

const unidades = [
  { id: 'u1', nome: 'UBS Norte', tipo: 'UBSF', ativo: true },
  { id: 'u2', nome: 'Farmácia Central', tipo: 'FARMACIA', ativo: true },
];

async function abrirRelatorios() {
  localStorage.setItem('sgp_token', 'token-teste');
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText('Painel Gerencial')).toBeInTheDocument();
  });
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: /relatórios/i }));
  await waitFor(() => {
    // Visão Geral é o relatório padrão ao abrir a tela
    expect(screen.getByRole('heading', { name: /visão geral/i })).toBeInTheDocument();
  });
}

describe('Relatórios (Gestor de Patrimônio)', () => {
  it('Empréstimos: mostra cards de resumo e a tabela com equipamento/patrimônio/status', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/emprestimos': {
        body: {
          total: 1,
          emAndamento: 1,
          concluida: 0,
          negadaCancelada: 0,
          percentualAtraso: 100,
          duracaoMediaDias: 0,
          itens: [
            {
              id: 's1',
              equipamento: 'Autoclave Vertical 75L',
              tombamento: '12345/2024',
              unidadeOrigem: 'UBS Norte',
              unidadeDestino: 'Farmácia Central',
              dataRetornoPrevista: '2026-01-10T00:00:00.000Z',
              status: 'AGUARDANDO_RETORNO',
              atrasado: true,
              criadoEm: '2025-12-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    await abrirRelatorios();
    await userEvent.selectOptions(screen.getByDisplayValue('Visão Geral'), 'Empréstimos');

    await waitFor(() => {
      expect(screen.getByText('Prazos e devoluções')).toBeInTheDocument();
    });
    expect(screen.getByText('Total de empréstimos')).toBeInTheDocument();
    expect(screen.getByText('Autoclave Vertical 75L')).toBeInTheDocument();
    expect(screen.getByText('Patrimônio 12345/2024')).toBeInTheDocument();
    expect(screen.getByText('Atrasado')).toBeInTheDocument();
  });

  it('Cessões de Uso: mostra cards de resumo (inclui valor total cedido) e a tabela', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/cessoes': {
        body: {
          total: 1,
          concluida: 1,
          aguardandoBranet: 0,
          valorTotal: 1500,
          itens: [
            {
              id: 'c1',
              entidadeExternaNome: 'Hospital Regional',
              tipoEquipamento: 'Autoclave Vertical 75L',
              numerosPatrimonio: ['12345/2024'],
              preco: 1500,
              unidadeOrigem: 'Galpão CIAD/Branet',
              status: 'CONCLUIDA',
              numeroPedidoBranet: 'PED-1',
              dataConclusao: '2026-01-05T00:00:00.000Z',
              criadoEm: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    await abrirRelatorios();
    await userEvent.selectOptions(screen.getByDisplayValue('Visão Geral'), 'Cessões de Uso');

    await waitFor(() => {
      expect(screen.getByText('Prestação de contas')).toBeInTheDocument();
    });
    expect(screen.getByText('Valor total cedido')).toBeInTheDocument();
    expect(screen.getByText('Hospital Regional')).toBeInTheDocument();
    expect(screen.getByText('Patrimônio 12345/2024')).toBeInTheDocument();
  });

  it('Itens e Estoque: ordena a tabela por quantidade e abre o detalhe das solicitações represadas', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/itens-por-unidade': { body: { unidades: [], linhas: [] } },
      '/relatorios/itens-estoque/detalhe': {
        body: [
          {
            id: 'sol-1',
            tipo: 'AMPLIACAO',
            unidadeOrigem: 'UBS Norte',
            quantidade: 2,
            prioridade: 1,
            criadoEm: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      '/relatorios/itens-estoque': {
        body: [
          {
            tipoEquipamento: { id: 't1', codigo: 'AUT-75', nome: 'Autoclave Vertical', categoriaId: 'c1', categoria: { nome: 'Esterilização', cor: '#000' } },
            quantidade: 2,
            solicitacoes: 1,
            aguardandoDesde: '2026-01-01T00:00:00.000Z',
          },
          {
            tipoEquipamento: { id: 't2', codigo: 'PUR-1', nome: 'Purificador de Água', categoriaId: 'c2', categoria: { nome: 'Cozinha', cor: '#111' } },
            quantidade: 5,
            solicitacoes: 1,
            aguardandoDesde: '2026-01-10T00:00:00.000Z',
          },
        ],
      },
    });
    await abrirRelatorios();
    await userEvent.selectOptions(screen.getByDisplayValue('Visão Geral'), 'Itens e Estoque');

    await waitFor(() => {
      expect(screen.getByText('Itens aguardando estoque')).toBeInTheDocument();
      expect(screen.getByText('Autoclave Vertical')).toBeInTheDocument();
    });

    // ordena por quantidade — clique inicial é desc (maior quantidade primeiro)
    await userEvent.click(screen.getByText('Quantidade', { selector: 'th' }));
    const linhas = screen.getAllByRole('row').slice(1); // pula o cabeçalho
    expect(within(linhas[0]).getByText('Purificador De Água')).toBeInTheDocument();

    // clicar na linha abre o drill-down das solicitações represadas
    await userEvent.click(linhas[0]);
    await waitFor(() => {
      expect(screen.getByText('Solicitações aguardando estoque desse item')).toBeInTheDocument();
    });
    expect(screen.getByText('Prioridade 1')).toBeInTheDocument();
  });
});
