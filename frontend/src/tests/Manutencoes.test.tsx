import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function entrarComo(perfil: string, caminho = '/manutencoes') {
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
        unidadeId: perfil === 'UNIDADE' ? 'u1' : null,
        unidadeNome: perfil === 'UNIDADE' ? 'UBS Centro' : null,
      },
    },
  };
}

const manutencao = {
  id: 'm1',
  numero: 7,
  status: 'PENDENTE_APROVACAO',
  descricaoProblema: 'Não atinge a temperatura adequada',
  justificativa: 'Compromete a esterilização',
  motivoNegacao: null,
  orcamentoValor: null,
  orcamentoDescricao: null,
  laudoBaixa: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  custoFinal: null,
  criadoEm: '2026-10-01T13:00:00.000Z',
  dataConclusao: null,
  equipamento: { id: 'e1', tombamento: '12345/2024', descricao: 'Autoclave', tipoEquipamento: { nome: 'Autoclave Vertical' } },
  unidade: { id: 'u1', nome: 'UBS Centro' },
  solicitante: { nome: 'Rodrigo' },
  contrato: null,
};

const contratoComItem = (extra: Record<string, unknown> = {}, escopo = { id: 'e1', nome: 'Preventiva e corretiva', cobrePreventiva: true, cobreCorretiva: true }) => ({
  id: 'c1',
  numero: 'CONT-2026-001',
  prestador: { id: 'p1', nome: 'Tecnomed' },
  status: 'ATIVO',
  itens: [{ id: 'i1', saldo: 4500, servico: { id: 's1', nome: 'Serviço de manutenção' }, escopo }],
  ...extra,
});

describe('Manutenções', () => {
  it('lista as manutenções e abre o detalhe em página própria com histórico recolhido', async () => {
    mockFetch({
      ...entrarComo('OPERADOR'),
      '/manutencoes/m1/historico': {
        body: [
          { id: 'abertura', acao: 'ABRIR_MANUTENCAO', criadoEm: '2026-10-01T13:00:00.000Z', usuario: 'Rodrigo' },
          { id: 'l1', acao: 'CONFIRMAR_RETORNO_MANUTENCAO', criadoEm: '2026-10-02T13:00:00.000Z', usuario: 'Ana', perfil: 'UNIDADE' },
        ],
      },
      '/manutencoes/m1': { body: manutencao },
      '/manutencoes': { body: [manutencao] },
      '/contratos': { body: [] },
    });
    render(<App />);

    // A manutenção é um tipo de solicitação: a antiga rota abre a lista de Solicitações já filtrada
    expect(await screen.findByRole('heading', { name: 'Solicitações' })).toBeInTheDocument();
    expect(await screen.findByText('Pendente Aprovação')).toBeInTheDocument();
    expect(screen.getByText('1 solicitação')).toBeInTheDocument();
    expect(screen.getByText('Manutenção', { selector: '.cartao-tipo .inventario-data' })).toBeInTheDocument();
    expect(screen.getByText('MAN-0007')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Ver manutenção de Autoclave Vertical' }));
    expect(await screen.findByRole('heading', { name: 'Autoclave Vertical' })).toBeInTheDocument();
    // Informações: o nome do equipamento em cima e o tombamento embaixo
    const informacoes = screen.getByRole('heading', { name: 'Informações da manutenção' }).closest('section') as HTMLElement;
    expect(within(informacoes).getByText('Item').nextElementSibling).toHaveTextContent('Autoclave Vertical12345/2024');
    expect(screen.getByLabelText('Número MAN-0007')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Não atinge a temperatura adequada')).toBeInTheDocument();

    const historico = await screen.findByRole('region', { name: 'Histórico' });
    expect(within(historico).getByText('Manutenção solicitada')).not.toBeVisible();
    await userEvent.click(within(historico).getByRole('button', { name: 'Expandir histórico' }));
    expect(within(historico).getByText('Manutenção solicitada')).toBeVisible();
    expect(within(historico).getByText('Retorno confirmado pela unidade')).toBeInTheDocument();
  });

  it('a lista e o detalhe mostram o número e o título do pedido, sem repetir o nome do equipamento', async () => {
    const comTitulo = { ...manutencao, titulo: 'Autoclave da sala 2 não aquece' };
    mockFetch({
      ...entrarComo('OPERADOR'),
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: comTitulo },
      '/manutencoes': { body: [comTitulo] },
      '/contratos': { body: [] },
    });
    render(<App />);

    const link = await screen.findByRole('link', { name: 'Ver manutenção de Autoclave da sala 2 não aquece' });
    expect(link).toHaveTextContent('Autoclave da sala 2 não aquece');
    expect(screen.getByText('MAN-0007')).toBeInTheDocument();
    // só número e título: o nome do equipamento não aparece na lista
    expect(screen.queryByText('Autoclave Vertical')).not.toBeInTheDocument();

    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Autoclave da sala 2 não aquece' })).toBeInTheDocument();
    expect(screen.getByLabelText('Número MAN-0007')).toBeInTheDocument();
  });

  it('o detalhe mostra o item de contrato só pelo nome do serviço', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': {
        body: {
          ...manutencao,
          contrato: { id: 'c1', numero: 'CONT-2026-001', prestador: { nome: 'Tecnomed' } },
          contratoItem: {
            id: 'i1',
            valor: '9000',
            servico: { nome: 'Serviço de manutenção' },
            escopo: { nome: 'Manutenção preventiva' },
          },
        },
      },
      '/contratos': { body: [] },
    });
    render(<App />);

    const informacoes = (await screen.findByRole('heading', { name: 'Informações da manutenção' })).closest('section')!;
    expect(within(informacoes).getByText('Serviço de manutenção')).toBeInTheDocument();
    expect(within(informacoes).queryByText(/Manutenção preventiva/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Localização' })).toBeInTheDocument();
  });

  it('sem título, a lista e o detalhe seguem usando o nome do equipamento', async () => {
    mockFetch({
      ...entrarComo('OPERADOR'),
      '/manutencoes': { body: [{ ...manutencao, titulo: null }] },
      '/contratos': { body: [] },
    });
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Ver manutenção de Autoclave Vertical' })).toBeInTheDocument();
  });

  it('erro ao aprovar aparece no alerta nativo do navegador', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/aprovar': { status: 422, body: { mensagem: 'O item de contrato não tem saldo disponível.' } },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': { body: [contratoComItem()] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    await userEvent.selectOptions(await screen.findByLabelText('Item do contrato'), 'i1');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('O item de contrato não tem saldo disponível.'));
    expect(window.alert).toHaveBeenCalledTimes(1);
  });

  it('aprovar exige o item de contrato: sem escolha não confirma, sem item elegível avisa', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': {
        body: [
          contratoComItem(),
          // sem saldo e expirado: não aparecem
          contratoComItem({ id: 'c2', numero: 'CONT-X', itens: [{ id: 'i2', saldo: 0, servico: { id: 's2', nome: 'Sem saldo' }, escopo: { id: 'e1', nome: 'Preventiva e corretiva', cobrePreventiva: true, cobreCorretiva: true } }] }),
          contratoComItem({ id: 'c3', numero: 'CONT-Y', status: 'EXPIRADO' }),
        ],
      },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    const seletor = await screen.findByLabelText('Item do contrato');
    expect(screen.queryByRole('option', { name: /Selecionar depois/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Sem saldo/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: /Serviço de manutenção/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeDisabled();
    await userEvent.selectOptions(seletor, 'i1');
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeEnabled();
    expect(chamadas.some((c) => c.url.endsWith('/aprovar'))).toBe(false);
  });

  it('sem nenhum item elegível a aprovação não pode ser confirmada', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': { body: [] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    expect(await screen.findByText(/Nenhum item de contrato disponível/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeDisabled();
  });

  it('item que só permite corretiva não lista escopo só preventivo', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': {
        body: {
          ...manutencao,
          equipamento: {
            ...manutencao.equipamento,
            tipoEquipamento: { nome: 'Autoclave', permitePreventiva: false, permiteCorretiva: true },
          },
        },
      },
      '/contratos': {
        body: [
          contratoComItem({}, { id: 'e2', nome: 'Preventiva', cobrePreventiva: true, cobreCorretiva: false }),
          contratoComItem({ id: 'c2', numero: 'CONT-C', itens: [{ id: 'i9', saldo: 100, servico: { id: 's9', nome: 'Reparos' }, escopo: { id: 'e3', nome: 'Corretiva', cobrePreventiva: false, cobreCorretiva: true } }] }),
        ],
      },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    await screen.findByLabelText('Item do contrato');
    expect(screen.getAllByRole('option', { name: /Reparos|Serviço de manutenção/ })).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Reparos' })).toBeInTheDocument();
  });

  it('gestor aprova escolhendo um item de contrato (serviço e escopo), não o contrato', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/aprovar': { body: {} },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': { body: [contratoComItem()] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    expect(screen.queryByLabelText('Contrato da terceirizada')).not.toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText('Item do contrato'), 'i1');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/aprovar'))).toBe(true));
    const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/aprovar'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ contratoItemId: 'i1' });
  });

  it('negar exige o motivo e o envia', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/negar': { body: {} },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': { body: [] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Negar manutenção' }));
    const confirmar = await screen.findByRole('button', { name: 'Confirmar negação' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motivo da negação *'), 'Fora de garantia');
    await userEvent.click(confirmar);

    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/negar'))).toBe(true));
    const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/negar'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ motivo: 'Fora de garantia' });
  });

  it('a Unidade abre a manutenção pelo formulário de solicitação (tipo Manutenção) e volta à lista', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE', '/solicitacoes'),
      '/manutencoes': (init) => (init?.method === 'POST' ? { status: 201, body: { id: 'novo' } } : { body: [] }),
      '/solicitacoes': { body: [] },
      '/equipamentos': {
        body: [
          { id: 'e1', tombamento: '12345/2024', tipoEquipamento: { nome: 'Autoclave Vertical' }, unidade: { id: 'u1', nome: 'UBS Centro' } },
          { id: 'e9', tombamento: '99999', tipoEquipamento: { nome: 'Emprestado' }, unidade: { id: 'u9', nome: 'Outra UBS' } },
        ],
      },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Nova solicitação' }));
    const tipo = await screen.findByLabelText('Tipo');
    expect(within(tipo).getByRole('option', { name: 'Manutenção' })).toBeInTheDocument();
    await userEvent.selectOptions(tipo, 'MANUTENCAO');
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();

    // só os itens da própria unidade (o emprestado de outra unidade não aparece)
    await screen.findByRole('option', { name: /12345\/2024/ });
    expect(screen.queryByRole('option', { name: /99999/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Equipamento *'), 'e1');
    await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Não aquece');
    expect(screen.queryByLabelText('Justificativa *')).not.toBeInTheDocument();
    // sem título o envio fica bloqueado: ele é obrigatório
    expect(enviar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Título'), '  Autoclave da sala 2  ');
    expect(enviar).toBeEnabled();
    await userEvent.click(enviar);

    expect(await screen.findByRole('heading', { name: 'Solicitações' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/manutencoes'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      equipamentoId: 'e1',
      titulo: 'Autoclave da sala 2',
      descricaoProblema: 'Não aquece',
    });
    // nenhuma solicitação (SOL-) é criada: a manutenção segue o próprio fluxo
    expect(chamadas.some((c) => c.init?.method === 'POST' && c.url.endsWith('/solicitacoes'))).toBe(false);
  });

  it('o bloco de confirmação do retorno some depois que o seu lado confirmou', async () => {
    const aguardando = { ...manutencao, status: 'AGUARDANDO_RETORNO', confirmadoGestor: false, confirmadoUnidade: false };
    let atual = aguardando;
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/confirmar-retorno': () => {
        atual = { ...aguardando, confirmadoGestor: true };
        return { body: {} };
      },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': () => ({ body: atual }),
      '/contratos': { body: [] },
    });
    render(<App />);

    await userEvent.selectOptions(await screen.findByLabelText('Estado do equipamento pós-manutenção'), 'OTIMO');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar retorno' }));

    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/confirmar-retorno'))).toBe(true));
    const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/confirmar-retorno'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ estadoPosManutencao: 'OTIMO' });
    // Nada mais a fazer para este perfil: o bloco inteiro sai da tela
    await waitFor(() => expect(screen.queryByLabelText('Estado do equipamento pós-manutenção')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirmar retorno' })).not.toBeInTheDocument();
    // A confirmação fica registrada no card de informações
    expect(screen.getByText('Confirmação do administrador').nextElementSibling).toHaveTextContent('Confirmado');
  });

  it('o Administrador não abre manutenção: o tipo não é oferecido nem pela rota antiga', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/nova'),
      '/manutencoes': { body: [] },
      '/solicitacoes': { body: [] },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);
    const tipo = await screen.findByLabelText('Tipo');
    expect(tipo).toHaveValue('');
    expect(within(tipo).queryByRole('option', { name: 'Manutenção' })).not.toBeInTheDocument();
  });

  it('oferece nova tentativa quando a lista falha', async () => {
    let falhar = true;
    mockFetch({
      ...entrarComo('OPERADOR'),
      '/manutencoes': () => (falhar ? { status: 500, body: { mensagem: 'Falha' } } : { body: [manutencao] }),
    });
    render(<App />);
    expect(await screen.findByText('Não foi possível carregar as solicitações.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma solicitação encontrada')).not.toBeInTheDocument();
    falhar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Pendente Aprovação')).toBeInTheDocument();
  });

  describe('lista unificada de Solicitações', () => {
    const solicitacao = {
      id: 's1',
      numero: 3,
      titulo: 'Consultório novo',
      tipo: 'AMPLIACAO',
      status: 'PENDENTE_APROVACAO',
      criadoEm: '2026-10-05T10:00:00.000Z',
      unidadeOrigem: { id: 'u1', nome: 'UBS Centro' },
      equipamento: null,
      tipoEquipamento: { id: 't1', nome: 'Autoclave', codigo: 'AUT' },
    };
    const maisNova = { ...manutencao, id: 'm2', numero: 8, titulo: 'Geladeira parou', criadoEm: '2026-10-09T10:00:00.000Z' };

    it('junta solicitações e manutenções, da mais recente para a mais antiga, e não tem mais o item Manutenções no menu', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/solicitacoes'),
        '/solicitacoes': { body: [solicitacao] },
        '/manutencoes': { body: [maisNova] },
      });
      render(<App />);

      await screen.findByText('Geladeira parou');
      const linhas = screen.getAllByRole('row').slice(1);
      expect(linhas[0]).toHaveTextContent('MAN-0008');
      expect(linhas[1]).toHaveTextContent('SOL-0003');
      expect(within(linhas[0]).getByRole('link', { name: 'Ver manutenção de Geladeira parou' })).toHaveAttribute('href', '/manutencoes/m2');
      expect(screen.getByText('2 solicitações')).toBeInTheDocument();
      const menu = within(screen.getByRole('navigation', { name: 'Navegação principal' }));
      expect(menu.queryByRole('link', { name: 'Manutenções' })).not.toBeInTheDocument();
      expect(menu.getByRole('link', { name: 'Solicitações' })).toBeInTheDocument();
    });

    it('o tipo Manutenção consulta só as manutenções, e um status de solicitação não consulta o lado das manutenções', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/solicitacoes'),
        '/solicitacoes': { body: [solicitacao] },
        '/manutencoes': { body: [maisNova] },
      });
      render(<App />);
      await screen.findByText('Geladeira parou');

      await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Manutenção' }));
      await waitFor(() => expect(screen.queryByText('Consultório novo')).not.toBeInTheDocument());
      expect(chamadas.filter((c) => c.url.includes('/solicitacoes')).length).toBe(1); // só a consulta inicial

      await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
      const status = screen.getByRole('combobox', { name: 'Filtrar por status' });
      expect(within(status).getByRole('option', { name: 'Em Andamento' })).toBeInTheDocument();
      expect(within(status).queryByRole('option', { name: 'Reservado' })).not.toBeInTheDocument();
    });

    it('a terceirizada só vê manutenções e não consulta solicitações', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/solicitacoes'),
        '/manutencoes': { body: [maisNova] },
      });
      render(<App />);
      await screen.findByText('Geladeira parou');
      expect(screen.queryByRole('link', { name: 'Nova solicitação' })).not.toBeInTheDocument();
      expect(chamadas.some((c) => c.url.includes('/solicitacoes'))).toBe(false);
      await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
      const itens = screen.getAllByRole('menuitemradio').map((i) => i.textContent?.trim());
      expect(itens).toEqual(['Todas', 'Manutenção']);
      const menu = within(screen.getByRole('navigation', { name: 'Navegação principal' }));
      expect(menu.getByRole('link', { name: 'Solicitações' })).toBeInTheDocument();
      expect(menu.queryByRole('link', { name: 'Manutenções' })).not.toBeInTheDocument();
    });

    it('o Galpão continua só com solicitações e não consulta manutenções', async () => {
      const chamadas = mockFetch({
        ...entrarComo('GALPAO', '/solicitacoes'),
        '/solicitacoes': { body: [solicitacao] },
      });
      render(<App />);
      await screen.findByText('Consultório novo');
      expect(chamadas.some((c) => c.url.includes('/manutencoes'))).toBe(false);
    });
  });

  describe('alerta de orçamento alto (50% do preço de referência)', () => {
    const comOrcamento = (orcamento: string, preco: string | null) => ({
      ...manutencao,
      status: 'ORCAMENTO_REGISTRADO',
      orcamentoValor: orcamento,
      equipamento: { ...manutencao.equipamento, tipoEquipamento: { nome: 'Autoclave', preco } },
    });
    const abrir = (corpo: unknown) => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/historico': { body: [] },
        '/manutencoes/m1': { body: corpo },
        '/contratos': { body: [] },
      });
      render(<App />);
    };

    it('a partir de 50% o administrador vê o alerta de manutenção não sugerida, sem bloquear a decisão', async () => {
      abrir(comOrcamento('5000', '10000'));
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent('Manutenção não sugerida');
      expect(alerta).toHaveTextContent(/50%/);
      expect(alerta).toHaveTextContent(/10\.000,00/);
      expect(screen.getByRole('button', { name: 'Aprovar orçamento' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Rejeitar orçamento' })).toBeEnabled();
    });

    it('abaixo de 50%, sem preço de referência ou fora da etapa de decisão não há alerta', async () => {
      abrir(comOrcamento('4999', '10000'));
      await screen.findByRole('button', { name: 'Aprovar orçamento' });
      expect(screen.queryByText('Manutenção não sugerida')).not.toBeInTheDocument();
    });

    it('sem preço de referência cadastrado não há alerta', async () => {
      abrir(comOrcamento('9000', null));
      await screen.findByRole('button', { name: 'Aprovar orçamento' });
      expect(screen.queryByText('Manutenção não sugerida')).not.toBeInTheDocument();
    });
  });

  describe('perfil Terceirizada', () => {
    const doContrato = {
      ...manutencao,
      contrato: { id: 'c1', numero: 'CONT-2026-001', prestador: { nome: 'Tecnomed' } },
      orcamentoValor: '1000',
    };

    it('em execução o Administrador não tem as ações de reparo: não emite baixa nem marca retorno', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/historico': { body: [] },
        '/manutencoes/m1': { body: { ...doContrato, status: 'EM_EXECUCAO' } },
        '/contratos': { body: [] },
      });
      render(<App />);

      await screen.findByRole('heading', { name: /Autoclave|Não atinge|MAN/ });
      for (const nome of ['Emitir laudo de baixa', 'Equipamento retornou', 'Confirmar reparo concluído']) {
        expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
      }
    });

    it('o Administrador não tem o formulário de orçamento: é só da terceirizada', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/historico': { body: [] },
        '/manutencoes/m1': { body: { ...doContrato, status: 'AGUARDANDO_ORCAMENTO' } },
        '/contratos': { body: [] },
      });
      render(<App />);

      await screen.findByRole('heading', { name: /Autoclave|Não atinge|MAN/ });
      expect(screen.queryByLabelText('Valor do orçamento (R$) *')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar orçamento' })).not.toBeInTheDocument();
    });

    it('lança o orçamento e não vê as ações de decisão do gestor', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1/orcamento': { body: {} },
        '/manutencoes/m1/historico': { body: [] },
        '/manutencoes/m1': { body: { ...doContrato, status: 'AGUARDANDO_ORCAMENTO' } },
      });
      render(<App />);

      await userEvent.type(await screen.findByLabelText('Valor do orçamento (R$) *'), '850');
      await userEvent.click(screen.getByRole('button', { name: 'Registrar orçamento' }));
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/orcamento'))).toBe(true));
      const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/orcamento'));
      expect(JSON.parse(String(post?.init?.body))).toEqual({ valor: 850 });
      expect(screen.queryByRole('button', { name: /Aprovar|Negar|baixa/i })).not.toBeInTheDocument();
      // dados de contrato do gestor não são buscados
      expect(chamadas.some((c) => c.url.endsWith('/contratos'))).toBe(false);
    });

    it('confirma o fim do reparo com o custo final', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1/registrar-retorno': { body: {} },
        '/manutencoes/m1/historico': { body: [] },
        '/manutencoes/m1': { body: { ...doContrato, status: 'EM_EXECUCAO' } },
      });
      render(<App />);

      await userEvent.type(await screen.findByLabelText('Custo final (R$)'), '900');
      expect(screen.queryByRole('button', { name: 'Emitir laudo de baixa' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar reparo concluído' }));
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/registrar-retorno'))).toBe(true));
      const post = chamadas.find((c) => c.url.endsWith('/registrar-retorno'));
      expect(JSON.parse(String(post?.init?.body))).toEqual({ custoFinal: 900 });
    });

    it('vê o contrato como o gestor, só que bloqueado, com valor e saldo dos itens', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/contratos'),
        '/contratos': {
          body: [
            {
              id: 'c1',
              numero: 'CONT-2026-001',
              prestadorId: 'p1',
              prestador: { id: 'p1', nome: 'Tecnomed' },
              objeto: 'Manutenção de autoclaves',
              valorTotal: '9000',
              status: 'ATIVO',
              vigenciaInicio: '2026-01-01T00:00:00.000Z',
              vigenciaFim: '2026-12-31T00:00:00.000Z',
              ativo: true,
              itens: [
                {
                  id: 'i1',
                  servicoId: 's1',
                  valor: '9000',
                  saldo: 6500,
                  escopoId: 'e1',
                  servico: { id: 's1', nome: 'Serviço de manutenção' },
                  escopo: { id: 'e1', nome: 'Manutenção preventiva', cobrePreventiva: true, cobreCorretiva: false },
                },
              ],
            },
          ],
        },
      });
      render(<App />);

      expect(screen.queryByRole('link', { name: 'Novo contrato' })).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('link', { name: 'Ver contrato CONT-2026-001' }));
      expect(await screen.findByRole('heading', { name: 'Contrato CONT-2026-001' })).toBeInTheDocument();
      expect(await screen.findByLabelText('Número do contrato')).toBeDisabled();
      expect(screen.getByLabelText('Prestador de serviço')).toHaveDisplayValue('Tecnomed');
      expect(screen.getByLabelText('Tipo de serviço')).toBeDisabled();
      expect(screen.getByLabelText('Tipo de serviço')).toHaveDisplayValue('Serviço de manutenção');
      expect(screen.getByLabelText('Escopo')).toHaveDisplayValue('Manutenção preventiva');
      expect(screen.getByLabelText('Valor do item (R$)')).toBeDisabled();
      expect(screen.getByLabelText('Saldo do item (R$)').getAttribute('value')).toMatch(/6\.500,00/);
      for (const nome of ['Salvar', 'Excluir', '+ Adicionar item']) {
        expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
      // não busca os cadastros dos gestores
      expect(chamadas.some((c) => /prestadores|servicos-contrato|escopos-servico/.test(c.url))).toBe(false);
    });
  });
});
