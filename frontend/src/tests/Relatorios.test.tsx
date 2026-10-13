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
      perfil: 'OPERADOR',
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
      expect(screen.getByRole('heading', { name: /^Bem-vindo,/ })).toBeInTheDocument();
  });
  await userEvent.click(within(screen.getByRole('navigation')).getByRole('link', { name: 'Relatórios' }));
  await waitFor(() => {
    // Visão geral é o relatório padrão ao abrir a seção
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });
}

function irParaSubmenu(nome: string) {
  return userEvent.click(
    within(screen.getByRole('group', { name: 'Submenus de Relatórios' })).getByRole('link', { name: nome }),
  );
}

describe('Relatórios (Administrador)', () => {
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
          itens: [
            {
              id: 's1',
              numero: 12,
              titulo: 'Empréstimo de autoclave para a Farmácia',
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
    await irParaSubmenu('Empréstimos');
    expect(screen.getByRole('link', { name: 'Empréstimos' })).toHaveClass('active');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Empréstimos', level: 2 })).toBeInTheDocument();
    });
    expect(screen.getByText('Total de empréstimos')).toBeInTheDocument();
    // A primeira coluna mostra o número da solicitação e, embaixo, o título; o tombamento tem coluna própria
    expect(screen.getByRole('columnheader', { name: 'Solicitação' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Tombamento' })).toBeInTheDocument();
    expect(screen.getByText('SOL-0012')).toBeInTheDocument();
    expect(screen.getByText('Empréstimo de autoclave para a Farmácia')).toBeInTheDocument();
    expect(screen.getByText('12345/2024')).toBeInTheDocument();
    expect(screen.queryByText('Autoclave Vertical 75L')).not.toBeInTheDocument();
    expect(screen.queryByText(/registro/)).not.toBeInTheDocument();
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
              numero: 15,
              titulo: 'Cessão de autoclave ao Hospital Regional',
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
    await irParaSubmenu('Cessões de uso');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Cessões de uso', level: 2 })).toBeInTheDocument();
    });
    expect(screen.getByText('Valor total cedido')).toBeInTheDocument();
    expect(screen.getByText('Hospital Regional')).toBeInTheDocument();
    expect(screen.getByText('SOL-0015')).toBeInTheDocument();
    expect(screen.getByText('Cessão de autoclave ao Hospital Regional')).toBeInTheDocument();
    expect(screen.getByText('Patrimônio 12345/2024')).toBeInTheDocument();
  });

  it('Ampliação: ordena a tabela por quantidade', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
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
    await irParaSubmenu('Ampliação');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Itens aguardando estoque' })).toBeInTheDocument();
      expect(screen.getByText('Autoclave Vertical')).toBeInTheDocument();
    });

    // ordena por quantidade — clique inicial é desc (maior quantidade primeiro)
    await userEvent.click(within(screen.getByRole('columnheader', { name: 'Quantidade' })).getByRole('button'));
    expect(screen.getByRole('columnheader', { name: 'Quantidade' })).toHaveAttribute('aria-sort', 'descending');
    const linhas = screen.getAllByRole('row').slice(1); // pula o cabeçalho
    expect(within(linhas[0]).getByText('Purificador De Água')).toBeInTheDocument();

    // o nome do equipamento é só texto: não abre detalhe
    expect(within(linhas[0]).queryByRole('button')).not.toBeInTheDocument();
  });

  it('abrir a seção leva à Visão geral e uma rota inválida volta a ela', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
    });
    await abrirRelatorios();
    expect(window.location.pathname).toBe('/relatorios/visao-geral');
    // Os quatro submenus aparecem sob "Relatórios"
    const submenus = within(screen.getByRole('group', { name: 'Submenus de Relatórios' })).getAllByRole('link');
    expect(submenus.map((l) => l.textContent)).toEqual(['Visão geral', 'Ampliação', 'Empréstimos', 'Cessões de uso', 'Manutenções']);
    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveClass('active');
    // O item pai não fica marcado junto com o submenu
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Relatórios' })).not.toHaveClass('active');
  });
});

describe('Relatório de manutenções', () => {
  const relatorio = {
    total: 3,
    truncado: false,
    emAndamento: 1,
    concluidas: 1,
    negadas: 0,
    baixadas: 1,
    custoTotal: 2400,
    tempoMedioDias: 7.5,
    orcamentosAltos: 1,
    porMes: [
      { mes: '2026-09', quantidade: 1, custo: 900 },
      { mes: '2026-10', quantidade: 2, custo: 1500 },
    ],
    porPrestador: [{ prestadorId: 'p1', prestador: 'Tecnomed', quantidade: 3, custo: 2400 }],
    porItem: [{ tipoEquipamentoId: 't1', nome: 'Autoclave 75L', quantidade: 3, custo: 2400 }],
    itensTotal: 3,
    itens: [
      {
        id: 'm1',
        numero: 7,
        titulo: 'Autoclave da sala 2',
        status: 'ORCAMENTO_REGISTRADO',
        equipamento: 'Autoclave',
        tombamento: '123/2024',
        unidade: 'UBS Norte',
        prestador: 'Tecnomed',
        contrato: 'CONT-1',
        orcamento: 1500,
        custoFinal: null,
        naoSugerida: true,
        criadoEm: '2026-10-02T12:00:00.000Z',
        dataConclusao: null,
      },
    ],
  };

  it('mostra totais, custo, tempo médio, gráficos, prestadores e a tabela com o aviso de não sugerida', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/prestadores': { body: [{ id: 'p1', nome: 'Tecnomed', cnpj: null, telefone: null, email: null, _count: { contratos: 1 } }] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/manutencoes': { body: relatorio },
    });
    await abrirRelatorios();
    await irParaSubmenu('Manutenções');

    expect(await screen.findByRole('heading', { name: 'Manutenções', level: 2 })).toBeInTheDocument();
    expect(await screen.findByText('Total de manutenções')).toBeInTheDocument();
    expect(screen.getByText(/2\.400,00/, { selector: '.stat-value' })).toBeInTheDocument();
    expect(screen.getByText('7,5 dias')).toBeInTheDocument();
    expect(screen.getByText('Orçamentos a partir de 50% do preço de referência do item')).toBeInTheDocument();
    // gráficos e prestadores
    expect(screen.getByText('Out/26')).toBeInTheDocument();
    expect(screen.getByTitle('Autoclave 75L')).toBeInTheDocument();
    const mes = screen.getByRole('list', { name: 'Custo por mês' });
    expect(within(mes).getByText('Out/26')).toBeInTheDocument();
    expect(within(mes).getByText(/1\.500,00/)).toBeInTheDocument();
    const prestadores = screen.getByRole('heading', { name: 'Prestadores', level: 3 }).closest('.card')!;
    expect(within(prestadores as HTMLElement).getByText('Tecnomed')).toBeInTheDocument();
    // tabela com número, título e selo
    const tabela = screen.getAllByRole('table').at(-1)!;
    expect(within(tabela).getByText('MAN-0007')).toBeInTheDocument();
    expect(within(tabela).getByText('Autoclave da sala 2')).toBeInTheDocument();
    expect(within(tabela).getByText('Orçamento Registrado')).toBeInTheDocument();
    expect(within(tabela).getByText('Não sugerida')).toBeInTheDocument();
  });

  it('os filtros de prestador, situação e busca vão na consulta', async () => {
    const chamadas = mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/prestadores': { body: [{ id: 'p1', nome: 'Tecnomed', cnpj: null, telefone: null, email: null, _count: { contratos: 1 } }] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/manutencoes': { body: { ...relatorio, itens: [], itensTotal: 0 } },
    });
    await abrirRelatorios();
    await irParaSubmenu('Manutenções');
    await screen.findByText('Total de manutenções');
    await screen.findByRole('option', { name: 'Tecnomed' });

    await userEvent.selectOptions(screen.getByLabelText('Prestador de serviço'), 'p1');
    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'Em andamento');
    await userEvent.type(screen.getByLabelText('Buscar manutenções'), 'MAN-0007');
    await waitFor(() => {
      const ultima = chamadas.filter((c) => c.url.includes('/relatorios/manutencoes')).at(-1)!;
      expect(ultima.url).toContain('prestadorId=p1');
      expect(ultima.url).toContain('situacao=EM_ANDAMENTO');
      expect(ultima.url).toContain('busca=MAN-0007');
    });
    expect(await screen.findByText('Sem manutenções para os filtros selecionados', { selector: '.rel-tabela .empty-state' })).toBeInTheDocument();
  });

  it('sem dados mostra o estado vazio e, se a lista foi truncada, avisa para restringir o período', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/prestadores': { body: [] },
      '/relatorios/visao-geral': { body: [] },
      '/relatorios/ranking-unidades': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/manutencoes': {
        body: { ...relatorio, total: 5000, truncado: true, tempoMedioDias: null, porMes: [], porPrestador: [], porItem: [], itens: [], itensTotal: 0 },
      },
    });
    await abrirRelatorios();
    await irParaSubmenu('Manutenções');
    expect(await screen.findByText(/consideram as 5000 manutenções mais recentes/)).toBeInTheDocument();
    expect(screen.getByText('—', { selector: '.stat-value' })).toBeInTheDocument();
  });
});

describe('Visão geral com manutenções', () => {
  it('a manutenção aparece como mais um tipo no funil e no ranking de unidades, e entra no total', async () => {
    mockFetch({
      ...me,
      ...dashboardVazio,
      '/unidades': { body: unidades },
      '/categorias': { body: [] },
      '/relatorios/resumo-item': { body: null, status: 404 },
      '/relatorios/visao-geral': {
        body: [
          { tipo: 'AMPLIACAO', emAndamento: 1, concluida: 1, negadaCancelada: 0 },
          { tipo: 'MANUTENCAO', emAndamento: 3, concluida: 5, negadaCancelada: 1 },
        ],
      },
      '/relatorios/ranking-unidades': {
        body: [{ unidadeId: 'u1', unidade: 'UBS Norte', SUBSTITUICAO: 0, AMPLIACAO: 1, EMPRESTIMO: 0, RECOLHA: 0, MANUTENCAO: 9 }],
      },
    });
    await abrirRelatorios();

    // total de solicitações = 2 (ampliação) + 9 (manutenção)
    expect(await screen.findByText('11')).toBeInTheDocument();
    expect(screen.getByText('Manutenção', { selector: '.resumo-tipo-cabecalho strong' })).toBeInTheDocument();
    expect(screen.getByText('Principal demanda: manutenção')).toBeInTheDocument();
  });
});
