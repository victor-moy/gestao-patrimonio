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

describe('Manutenções', () => {
  it('lista as manutenções e abre o detalhe em página própria com histórico recolhido', async () => {
    mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO'),
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

    expect(await screen.findByRole('heading', { name: 'Manutenções' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /nova solicitação/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Pendente Aprovação')).toBeInTheDocument();
    expect(screen.getByText('1 manutenção')).toBeInTheDocument();
    expect(screen.getByText('MAN-0007')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Ver manutenção de Autoclave Vertical' }));
    expect(await screen.findByRole('heading', { name: 'Autoclave Vertical' })).toBeInTheDocument();
    expect(screen.getByLabelText('Número MAN-0007')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Não atinge a temperatura adequada')).toBeInTheDocument();

    const historico = await screen.findByRole('region', { name: 'Histórico' });
    expect(within(historico).getByText('Manutenção solicitada')).not.toBeVisible();
    await userEvent.click(within(historico).getByRole('button', { name: 'Expandir histórico' }));
    expect(within(historico).getByText('Manutenção solicitada')).toBeVisible();
    expect(within(historico).getByText('Retorno confirmado pela unidade')).toBeInTheDocument();
  });

  it('erro ao aprovar aparece no alerta nativo do navegador', async () => {
    mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/manutencoes/m1'),
      '/manutencoes/m1/aprovar': { status: 422, body: { mensagem: 'Contrato vencido.' } },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': { body: manutencao },
      '/contratos': { body: [] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Contrato vencido.'));
    expect(window.alert).toHaveBeenCalledTimes(1);
  });

  it('gestor aprova com um clique quando não há contratos cadastrados', async () => {
    let aprovada = false;
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/manutencoes/m1'),
      '/manutencoes/m1/aprovar': () => {
        aprovada = true;
        return { body: {} };
      },
      '/manutencoes/m1/historico': { body: [] },
      '/manutencoes/m1': () => ({ body: aprovada ? { ...manutencao, status: 'AGUARDANDO_ORCAMENTO' } : manutencao }),
      '/contratos': { body: [] },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Aprovar manutenção' }));
    expect(await screen.findByRole('button', { name: 'Registrar orçamento' })).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/aprovar') && c.init?.method === 'POST')).toBe(true);
    expect(await screen.findByRole('button', { name: 'Registrar orçamento' })).toBeInTheDocument();
  });

  it('negar exige o motivo e o envia', async () => {
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/manutencoes/m1'),
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

  it('unidade solicita manutenção em página própria e volta à lista com a confirmação', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE'),
      '/manutencoes': (init) => (init?.method === 'POST' ? { status: 201, body: { id: 'novo' } } : { body: [] }),
      '/equipamentos': {
        body: [{ id: 'e1', tombamento: '12345/2024', tipoEquipamento: { nome: 'Autoclave Vertical' }, unidade: { id: 'u1', nome: 'UBS Centro' } }],
      },
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('link', { name: 'Nova solicitação' }));
    expect(await screen.findByRole('heading', { name: 'Nova manutenção' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const enviar = screen.getByRole('button', { name: 'Enviar solicitação' });
    expect(enviar).toBeDisabled();

    await waitFor(() => expect(screen.getByLabelText('Equipamento')).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText('Equipamento'), 'e1');
    await userEvent.type(screen.getByLabelText('Descrição do problema'), 'Não aquece');
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    await userEvent.click(enviar);

    expect(await screen.findByRole('heading', { name: 'Manutenções' })).toBeInTheDocument();
    const post = chamadas.find((c) => c.init?.method === 'POST' && c.url.endsWith('/manutencoes'));
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      equipamentoId: 'e1',
      descricaoProblema: 'Não aquece',
    });
  });

  it('o bloco de confirmação do retorno some depois que o seu lado confirmou', async () => {
    const aguardando = { ...manutencao, status: 'AGUARDANDO_RETORNO', confirmadoGestor: false, confirmadoUnidade: false };
    let atual = aguardando;
    const chamadas = mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO', '/manutencoes/m1'),
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
    expect(screen.getByText('Confirmação do gestor').nextElementSibling).toHaveTextContent('Confirmado');
  });

  it('só a unidade abre a página de nova manutenção', async () => {
    mockFetch({ ...entrarComo('GESTOR_MANUTENCAO', '/manutencoes/nova'), '/manutencoes': { body: [] } });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Manutenções' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nova manutenção' })).not.toBeInTheDocument();
  });

  it('oferece nova tentativa quando a lista falha', async () => {
    let falhar = true;
    mockFetch({
      ...entrarComo('GESTOR_MANUTENCAO'),
      '/manutencoes': () => (falhar ? { status: 500, body: { mensagem: 'Falha' } } : { body: [manutencao] }),
    });
    render(<App />);
    expect(await screen.findByText('Não foi possível carregar as manutenções.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma manutenção encontrada')).not.toBeInTheDocument();
    falhar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Pendente Aprovação')).toBeInTheDocument();
  });
});
