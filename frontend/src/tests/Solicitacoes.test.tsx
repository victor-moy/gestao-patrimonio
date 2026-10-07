import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const me = {
  '/auth/me': {
    body: {
      id: '1',
      nome: 'Rodrigo',
      email: 'ubs.centro@joinville.sc.gov.br',
      matricula: '10003',
      perfil: 'UNIDADE',
      unidadeId: 'u1',
      unidadeNome: 'UBS Centro',
    },
  },
};

describe('Solicitações (UC10/UC13/UC16)', () => {
  it('unidade cria solicitação de ampliação pelo catálogo de tipos', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    const chamadas = mockFetch({
      ...me,
      '/solicitacoes': (init) =>
        init?.method === 'POST'
          ? {
              status: 201,
              body: { ids: ['nova'] },
            }
          : { body: [] },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': {
        body: [
          {
            id: 'c1',
            nome: 'Esterilização',
            tipos: [{ id: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6', codigo: 'AUT-V75', nome: 'Autoclave Vertical 75L', categoriaId: 'c1' }],
          },
        ],
      },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/bem-vindo/i)).toBeInTheDocument());
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: /solicitações/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /nova solicitação/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /nova solicitação/i }));

    // Catálogo de tipos (página dedicada, não mais um modal)
    await waitFor(() =>
      expect(screen.getByText('Selecione o tipo de solicitação')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /ampliação/i }));

    // Formulário do tipo escolhido — Ampliação aceita múltiplos itens
    // numa lista repetível (feedback do cliente 17/08). O tipo é escolhido
    // via combobox com busca (SeletorTipoEquipamento), não um <select> nativo.
    await waitFor(() => expect(screen.getByText('Tipo de Item *')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Selecione o item...'));
    await userEvent.type(screen.getByPlaceholderText('Buscar por nome ou código...'), 'Autoclave');
    await userEvent.click(screen.getByText('Autoclave Vertical 75L'));
    await userEvent.type(
      screen.getByRole('textbox'),
      'Ampliação da capacidade de esterilização',
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(screen.getByText('Solicitação registrada.')).toBeInTheDocument();
    });
    const post = chamadas.find(
      (c) => c.url.includes('/solicitacoes') && c.init?.method === 'POST',
    );
    expect(post).toBeDefined();
    const corpo = JSON.parse(String(post!.init!.body));
    expect(corpo.tipo).toBe('AMPLIACAO');
    expect(corpo.itens).toEqual([
      { tipoEquipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6', quantidade: 1 },
    ]);
    expect(corpo.origemRecurso).toBeUndefined();
  });

  it('lista solicitações com tipo e status', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    mockFetch({
      ...me,
      '/solicitacoes': {
        body: [
          {
            id: 's1',
            tipo: 'CESSAO_USO',
            status: 'PENDENTE_APROVACAO',
            justificativa: 'UBS Centro necessita de um equipamento adicional',
            motivoNegacao: null,
            quantidade: null,
            origemRecurso: null,
            anexoUrl: null,
            entidadeExternaNome: 'Hospital Regional',
            dataRetornoPrevista: null,
            automatica: false,
            criadoEm: '2026-05-02T10:00:00.000Z',
            valorVinculado: null,
            unidadeOrigem: { id: 'u1', nome: 'UBS Sul' },
            unidadeDestino: null,
            equipamento: { id: 'e1', tombamento: '12348/2023', descricao: 'Autoclave Vertical 21L' },
            tipoEquipamento: null,
            ata: null,
            criadoPor: { nome: 'Carlos Eduardo' },
          },
        ],
      },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/bem-vindo/i)).toBeInTheDocument());
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: /solicitações/i }),
    );
    await waitFor(() => {
      expect(screen.getAllByText('Cessão de Uso').length).toBeGreaterThan(0);
      expect(screen.getByText('#12348/2023')).toBeInTheDocument();
      expect(screen.getAllByText('Pendente Aprovação').length).toBeGreaterThan(0);
    });
  });
});

const pedido = {
  id: 's1', tipo: 'AMPLIACAO', status: 'PENDENTE_APROVACAO',
  justificativa: 'Ampliar atendimento', quantidade: 2, origemRecurso: 'REGULAR',
  automatica: false, criadoEm: '2026-05-02T10:00:00.000Z',
  unidadeOrigem: { id: 'u1', nome: 'UBS Centro' },
  tipoEquipamento: { id: 't1', nome: 'Autoclave de teste', codigo: 'AUT' },
};

function abrirLista(rotas: Parameters<typeof mockFetch>[0], perfil = 'UNIDADE') {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', '/solicitacoes');
  const chamadas = mockFetch({
    '/auth/me': { body: { ...me['/auth/me'].body, perfil } },
    ...rotas,
  });
  render(<App />);
  return chamadas;
}

it('pagina solicitações e mantém os detalhes acessíveis pelo teclado', async () => {
  abrirLista({ '/solicitacoes': { body: Array.from({ length: 9 }, (_, i) => ({
    ...pedido, id: `s${i}`, tipoEquipamento: { ...pedido.tipoEquipamento, nome: `Item ${i + 1}` },
  })) } });
  await screen.findByText('Item 1');
  expect(screen.queryByText('Item 9')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
  expect(screen.getByText('Item 9')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  const detalhes = screen.getByRole('button', { name: 'Ver solicitação de Item 9' });
  detalhes.focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('refina pseudo-status de recolha e limpa status incompatível ao mudar de tipo', async () => {
  const patrimonio = { ...pedido, id: 'p', tipo: 'RECOLHA', status: 'AGUARDANDO_ENTREGA' };
  const branet = { ...patrimonio, id: 'b', pedidoEntregaRegistradoEm: '2026-05-04T10:00:00.000Z',
    tipoEquipamento: { ...pedido.tipoEquipamento, nome: 'Item Branet' } };
  const chamadas = abrirLista({
    '/solicitacoes?tipo=RECOLHA&status=AGUARDANDO_ENTREGA': { body: [patrimonio, branet] },
    '/solicitacoes': { body: [patrimonio, branet] },
  });
  await screen.findByText('Item Branet');
  await userEvent.click(screen.getByRole('button', { name: 'Recolha' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por status' }), 'AGUARDANDO_RECOLHA_BRANET');
  await waitFor(() => expect(screen.queryByText('Autoclave de teste')).not.toBeInTheDocument());
  expect(screen.getByText('Item Branet')).toBeInTheDocument();
  expect(chamadas.some((c) => c.url.endsWith('tipo=RECOLHA&status=AGUARDANDO_ENTREGA'))).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Empréstimo' }));
  expect(screen.getByRole('combobox', { name: 'Filtrar por status' })).toHaveValue('');
  expect(screen.queryByRole('option', { name: 'Aguardando Recolha (Branet)' })).not.toBeInTheDocument();
});

it('filtra disponibilidade para reserva e preserva restrição de criação do galpão', async () => {
  abrirLista({ '/solicitacoes': { body: [
    { ...pedido, status: 'AGUARDANDO_DISPONIBILIDADE', disponivelParaReserva: true },
    { ...pedido, id: 's2', status: 'AGUARDANDO_DISPONIBILIDADE', disponivelParaReserva: false,
      tipoEquipamento: { ...pedido.tipoEquipamento, nome: 'Sem estoque' } },
  ] } }, 'GALPAO');
  await screen.findByText('Sem estoque');
  expect(screen.queryByRole('button', { name: /nova solicitação/i })).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por status' }), 'DISPONIVEL_PARA_RESERVA');
  await waitFor(() => expect(screen.queryByText('Sem estoque')).not.toBeInTheDocument());
  expect(screen.getByText('Autoclave de teste')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  await screen.findByText('Sem estoque');
});

it('oferece nova tentativa quando a consulta falha', async () => {
  let falhar = true;
  abrirLista({ '/solicitacoes': () => falhar
    ? { status: 500, body: { mensagem: 'Falha temporária' } }
    : { body: [pedido] } });
  await screen.findByText('Não foi possível carregar as solicitações.');
  expect(screen.queryByText('Nenhuma solicitação encontrada')).not.toBeInTheDocument();
  falhar = false;
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByText('Autoclave de teste');
});
