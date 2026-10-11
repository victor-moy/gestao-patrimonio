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
      expect(screen.getByRole('link', { name: /nova solicitação/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('link', { name: /nova solicitação/i }));

    // Tipo escolhido num seletor na própria página; o formulário aparece abaixo
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Tipo' }),
      'AMPLIACAO',
    );

    // Formulário do tipo escolhido — Ampliação aceita múltiplos itens
    // numa lista repetível (feedback do cliente 17/08). O item é escolhido
    // num <select> agrupado por categoria, como nos demais formulários.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Tipo de Item' })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de Item' }),
      '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
    );
    await userEvent.type(
      screen.getByRole('textbox'),
      'Ampliação da capacidade de esterilização',
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Solicitações' })).toBeInTheDocument();
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
      expect(screen.queryByText('#12348/2023')).not.toBeInTheDocument();
      expect(screen.getAllByText('Pendente Aprovação').length).toBeGreaterThan(0);
    });
  });
});

const pedido = {
  id: 's1', numero: 12, tipo: 'AMPLIACAO', status: 'PENDENTE_APROVACAO',
  justificativa: 'Ampliar atendimento', quantidade: 2, origemRecurso: 'REGULAR',
  automatica: false, criadoEm: '2026-05-02T10:00:00.000Z',
  unidadeOrigem: { id: 'u1', nome: 'UBS Centro' },
  tipoEquipamento: { id: 't1', nome: 'Autoclave de teste', codigo: 'AUT' },
};

async function selecionarVisualizacao(rotulo: string) {
  const seletor = screen.getByRole('button', { name: /^(Todas|Ampliação|Substituição|Empréstimo|Recolha|Cessão de Uso)$/ });
  await userEvent.click(seletor);
  await userEvent.click(screen.getByRole('menuitemradio', { name: rotulo }));
}

async function abrirFiltros() {
  const botao = screen.getByRole('button', { name: 'Filtrar' });
  if (botao.getAttribute('aria-expanded') !== 'true') await userEvent.click(botao);
}

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

it('pagina solicitações e abre o detalhe em página própria pelo teclado', async () => {
  const lista = Array.from({ length: 12 }, (_, i) => ({
    ...pedido, id: `s${i}`, tipoEquipamento: { ...pedido.tipoEquipamento, nome: `Item ${i + 1}` },
  }));
  abrirLista({
    '/solicitacoes/s10': { body: lista[10] },
    '/solicitacoes': { body: lista },
  });
  await screen.findByText('Item 1');
  expect(screen.queryByText('Item 11')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
  expect(screen.getByText('Item 11')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  const detalhes = screen.getByRole('link', { name: 'Ver solicitação de Item 11' });
  detalhes.focus();
  await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'Item 11' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('Ampliar atendimento')).toBeInTheDocument();
});

it('gestor aprova a solicitação pela página de detalhe e permanece nela', async () => {
  let aprovada = false;
  const chamadas = abrirLista({
    '/solicitacoes/s1/aprovar': () => {
      aprovada = true;
      return { body: {} };
    },
    '/solicitacoes/s1': () => ({
      body: aprovada ? { ...pedido, status: 'RESERVADO' } : pedido,
    }),
    '/solicitacoes': { body: [pedido] },
  }, 'GESTOR_PATRIMONIO');
  expect(await screen.findByText('SOL-0012')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('link', { name: 'Ver solicitação de Autoclave de teste' }));
  expect(await screen.findByLabelText('Número SOL-0012')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: /aprovar solicitação/i }));
  await userEvent.selectOptions(screen.getByLabelText(/prioridade/i), '1');
  await userEvent.click(screen.getByRole('button', { name: /confirmar aprovação/i }));

  await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/solicitacoes/s1/aprovar'))).toBe(true));
  const post = chamadas.find((c) => c.url.endsWith('/solicitacoes/s1/aprovar'));
  expect(JSON.parse(String(post?.init?.body))).toEqual({ prioridade: 1 });
  expect(screen.getByRole('heading', { name: 'Autoclave de teste' })).toBeInTheDocument();
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
  await selecionarVisualizacao('Recolha');
  await abrirFiltros();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por status' }), 'AGUARDANDO_RECOLHA_BRANET');
  await waitFor(() => expect(screen.queryByText('Autoclave de teste')).not.toBeInTheDocument());
  expect(screen.getByText('Item Branet')).toBeInTheDocument();
  expect(chamadas.some((c) => c.url.endsWith('tipo=RECOLHA&status=AGUARDANDO_ENTREGA'))).toBe(true);
  await selecionarVisualizacao('Empréstimo');
  await abrirFiltros();
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
  expect(screen.queryByRole('link', { name: /nova solicitação/i })).not.toBeInTheDocument();
  await abrirFiltros();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por status' }), 'DISPONIVEL_PARA_RESERVA');
  await waitFor(() => expect(screen.queryByText('Sem estoque')).not.toBeInTheDocument());
  expect(screen.getByText('Autoclave de teste')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por status' }), '');
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

it('gestor ajusta o tombamento, o formulário fecha e a confirmação aparece', async () => {
  let tombamento = '90001';
  const validacao = () => ({
    ...pedido,
    status: 'AGUARDANDO_VALIDACAO',
    recebimentoOk: false,
    observacaoRecebimento: 'Divergência de patrimônio: esperado 11, informado 90001.',
    itensGerados: [{ id: '3f2b8a0e-6c1d-4a39-9f43-5d7a1c2e9b10', descricao: 'Autoclave', tombamento }],
  });
  const chamadas = abrirLista({
    '/solicitacoes/s1/ajustar-tombamento': (init) => {
      tombamento = JSON.parse(String(init?.body)).itens[0].tombamento;
      return { body: {} };
    },
    '/solicitacoes/s1': () => ({ body: validacao() }),
    '/solicitacoes': { body: [validacao()] },
  }, 'GESTOR_PATRIMONIO');
  await userEvent.click(await screen.findByRole('link', { name: 'Ver solicitação de Autoclave de teste' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ajustar tombamento' }));
  const campo = screen.getByRole('textbox', { name: 'Tombamento do item 1' });
  await userEvent.clear(campo);
  await userEvent.type(campo, '11');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar ajuste' }));

  await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/ajustar-tombamento'))).toBe(true));
  const patch = chamadas.find((c) => c.url.endsWith('/ajustar-tombamento'));
  expect(JSON.parse(String(patch?.init?.body)).itens[0]).toMatchObject({ tombamento: '11' });
  // Formulário volta ao estado inicial, com os dados recarregados
  expect(await screen.findByRole('button', { name: 'Ajustar tombamento' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Salvar ajuste' })).not.toBeInTheDocument();
});

it('empréstimo é aprovado com um clique, sem segunda confirmação', async () => {
  let aprovada = false;
  const emprestimo = { ...pedido, tipo: 'EMPRESTIMO', tipoEquipamento: null,
    equipamento: { id: 'e1', tombamento: '555', descricao: 'Monitor', tipoEquipamento: { nome: 'Monitor' } } };
  const chamadas = abrirLista({
    '/solicitacoes/s1/aprovar': () => {
      aprovada = true;
      return { body: {} };
    },
    '/solicitacoes/s1': () => ({ body: aprovada ? { ...emprestimo, status: 'AGUARDANDO_SAIDA' } : emprestimo }),
    '/solicitacoes': { body: [emprestimo] },
  }, 'GESTOR_PATRIMONIO');
  await userEvent.click(await screen.findByRole('link', { name: 'Ver solicitação de Monitor' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Aprovar solicitação' }));

  await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/solicitacoes/s1/aprovar') && c.init?.method === 'POST')).toBe(true));
  expect(chamadas.some((c) => c.url.endsWith('/solicitacoes/s1/aprovar') && c.init?.method === 'POST')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Confirmar aprovação' })).not.toBeInTheDocument();
});

it('mostra o histórico da solicitação com ação, autor e data, e avisa se não carregar', async () => {
  const detalhe = { ...pedido, status: 'RESERVADO' };
  abrirLista({
    '/solicitacoes/s1/historico': {
      body: [
        { id: 'abertura', acao: 'ABRIR_SOLICITACAO', criadoEm: '2026-10-01T13:00:00.000Z', usuario: 'Rodrigo' },
        { id: 'l1', acao: 'APROVAR_SOLICITACAO', criadoEm: '2026-10-02T12:30:00.000Z', usuario: 'Samuel' },
        { id: 'l2', acao: 'CONFIRMAR_RECEBIMENTO_ITEM', criadoEm: '2026-10-03T12:30:00.000Z', usuario: null, recebimentoOk: false },
      ],
    },
    '/solicitacoes/s1': { body: detalhe },
    '/solicitacoes': { body: [detalhe] },
  });
  await userEvent.click(await screen.findByRole('link', { name: 'Ver solicitação de Autoclave de teste' }));
  const secao = await screen.findByRole('region', { name: 'Histórico' });
  // Começa recolhido
  const alternar = within(secao).getByRole('button', { name: 'Expandir histórico' });
  expect(alternar).toHaveAttribute('aria-expanded', 'false');
  expect(within(secao).getByText('Solicitação aberta')).not.toBeVisible();
  await userEvent.click(alternar);
  expect(within(secao).getByRole('button', { name: 'Recolher histórico' })).toHaveAttribute('aria-expanded', 'true');
  expect(within(secao).getByText('Solicitação aberta')).toBeInTheDocument();
  expect(within(secao).getByText(/Rodrigo ·/)).toBeInTheDocument();
  expect(within(secao).getByText('Solicitação aprovada')).toBeInTheDocument();
  expect(within(secao).getByText(/Samuel ·/)).toBeInTheDocument();
  expect(within(secao).getByText('Recebimento confirmado com divergência')).toBeInTheDocument();
  const itens = within(secao).getAllByRole('listitem');
  expect(itens).toHaveLength(3);
  expect(itens[0]).toHaveTextContent('Solicitação aberta');
});

it('mantém a página funcionando quando o histórico falha', async () => {
  abrirLista({
    '/solicitacoes/s1/historico': { status: 500, body: { mensagem: 'erro' } },
    '/solicitacoes/s1': { body: pedido },
    '/solicitacoes': { body: [pedido] },
  });
  await userEvent.click(await screen.findByRole('link', { name: 'Ver solicitação de Autoclave de teste' }));
  expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Autoclave de teste' })).toBeInTheDocument();
});
