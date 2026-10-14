import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
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
        unidadeId: perfil === 'UNIDADE' ? 'u1' : null,
        unidadeNome: perfil === 'UNIDADE' ? 'UBS Centro' : null,
        prestadorId: perfil === 'TERCEIRIZADA' ? 'p1' : null,
      },
    },
    '/conversas': { body: [] },
    '/dashboard/alertas': { body: [] },
  };
}

const linha = (extra: Record<string, unknown> = {}) => ({
  id: 'l1',
  tipo: 'SERVICO',
  descricao: 'Impermeabilização da laje',
  unidadeMedida: 'm²',
  quantidade: '10',
  valorUnitario: '50',
  codigoSinapi: '99001',
  precoSinapi: '56.82',
  descontoPercentual: '12',
  criadoEm: '2026-10-02T13:00:00.000Z',
  ...extra,
});

const civil = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  numero: 12,
  tipo: 'CIVIL',
  titulo: 'Infiltração na recepção',
  status: 'PENDENTE_APROVACAO',
  descricaoProblema: 'Mancha de umidade no teto',
  localAfetado: 'Recepção',
  categoriaCivil: 'INFILTRACAO',
  fotos: [],
  motivoNegacao: null,
  orcamentoValor: null,
  orcamentoDescricao: null,
  laudoBaixa: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  custoFinal: null,
  criadoEm: '2026-10-01T13:00:00.000Z',
  dataConclusao: null,
  equipamento: null,
  unidade: { id: 'u1', nome: 'UBS Centro' },
  solicitante: { nome: 'Rodrigo' },
  contrato: null,
  linhasRelatorio: [],
  ...extra,
});

const contrato = (cobreCivil: boolean) => ({
  id: 'c1',
  numero: 'CONT-2026-001',
  prestador: { id: 'p1', nome: 'Predial Ltda' },
  status: 'ATIVO',
  itens: [
    {
      id: 'i1',
      saldo: 4500,
      servico: { id: 's1', nome: 'Manutenção predial' },
      escopo: { id: 'e1', nome: 'Civil', cobrePreventiva: false, cobreCorretiva: false, cobreCivil },
    },
  ],
});

const historico = { '/manutencoes/m1/historico': { body: [] } };

afterEach(() => localStorage.clear());

describe('Manutenção civil', () => {
  it('a unidade abre o chamado com local, tipo de problema e descrição, sem escolher equipamento', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE', '/solicitacoes/nova'),
      '/manutencoes/civil': { body: civil() },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);

    await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'MANUTENCAO');
    expect(screen.queryByRole('option', { name: 'Manutenção civil' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Natureza'), 'CIVIL');
    expect(screen.queryByLabelText('Equipamento *')).not.toBeInTheDocument();
    const enviar = screen.getByRole('button', { name: 'Enviar' });

    await userEvent.type(screen.getByLabelText('Título'), 'Infiltração na recepção');
    await userEvent.type(screen.getByLabelText('Local afetado *'), 'Recepção');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de problema *'), 'INFILTRACAO');
    expect(enviar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Mancha de umidade no teto');
    expect(enviar).toBeEnabled();

    await userEvent.click(enviar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/civil'))).toBe(true));
    const corpo = chamadas.find((c) => c.url.endsWith('/manutencoes/civil'))!.init!.body as FormData;
    expect(corpo.get('localAfetado')).toBe('Recepção');
    expect(corpo.get('categoriaCivil')).toBe('INFILTRACAO');
    expect(corpo.get('titulo')).toBe('Infiltração na recepção');
  });

  it('o detalhe mostra local e tipo de problema no lugar do equipamento', async () => {
    mockFetch({
      ...entrarComo('UNIDADE', '/manutencoes/m1'),
      '/manutencoes/m1': { body: civil() },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Infiltração na recepção' })).toBeInTheDocument();
    const informacoes = screen.getByRole('heading', { name: 'Informações da manutenção' }).closest('section') as HTMLElement;
    expect(within(informacoes).getByText('Local afetado').nextElementSibling).toHaveTextContent('Recepção');
    expect(within(informacoes).getByText('Tipo de problema').nextElementSibling).toHaveTextContent('Infiltração');
    expect(within(informacoes).queryByText('Item')).not.toBeInTheDocument();
  });

  it('triagem: só oferece itens de contrato com escopo civil e mostra chamados parecidos', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/similares': {
        body: [{ id: 'm9', numero: 9, titulo: 'Goteira na recepção', status: 'EM_EXECUCAO', localAfetado: 'Recepção', criadoEm: '2026-09-30T10:00:00.000Z' }],
      },
      '/manutencoes/m1/aprovar': { body: {} },
      '/manutencoes/m1': { body: civil() },
      '/contratos': { body: [contrato(true)] },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByText(/Chamados parecidos em aberto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir MAN-0009 · Goteira na recepção' })).toHaveAttribute('href', '/manutencoes/m9');

    await userEvent.click(screen.getByRole('button', { name: 'Encaminhar ao prestador' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar encaminhamento' });
    expect(confirmar).toBeDisabled();
    await userEvent.selectOptions(await screen.findByLabelText('Item do contrato *'), 'i1');
    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/aprovar'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/aprovar'))!.init!.body as string)).toEqual({ contratoItemId: 'i1' });
  });

  it('sem item de contrato civil com saldo, o Administrador deixa o chamado aguardando providências', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/similares': { body: [] },
      '/manutencoes/m1/aguardar-providencias': { body: {} },
      '/manutencoes/m1': { body: civil() },
      '/contratos': { body: [contrato(false)] },
      ...historico,
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Encaminhar ao prestador' }));
    expect(await screen.findByText(/Nenhum item de contrato civil com saldo/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Selecione…' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Manutenção predial/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aguardar providências' }));
    await userEvent.type(screen.getByLabelText('O que falta para encaminhar *'), 'Contrato sem saldo');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/aguardar-providencias'))).toBe(true));
  });

  it('o prestador recebe o chamado aguardando execução e só pode iniciá-la', async () => {
    const chamadas = mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      '/manutencoes/m1/iniciar-execucao': { body: {} },
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_EXECUCAO' }) },
      ...historico,
    });
    render(<App />);

    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar execução' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/iniciar-execucao') && c.init?.method === 'POST')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
  });

  it('em execução, o prestador informa os itens SINAPI executados e confirma o reparo concluído', async () => {
    const chamadas = mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      '/sinapi': {
        body: [{ id: 's1', codigo: '99001', descricao: 'Troca de sifão', unidade: 'un', tipo: 'SERVICO', preco: '45.00', referencia: '2026-10' }],
      },
      '/manutencoes/m1/relatorio': { body: {} },
      '/manutencoes/m1/registrar-retorno': { body: {} },
      '/manutencoes/m1': {
        body: civil({
          status: 'EM_EXECUCAO',
          contestacaoUnidade: 'A infiltração voltou',
          motivoAjuste: 'Quantidade de mão de obra acima do esperado',
          contratoItem: { id: 'ci1', valor: '20000', descontoPercentual: '12', servico: { nome: 'Predial' }, escopo: { nome: 'Civil' } },
          linhasRelatorio: [linha()],
        }),
      },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByText('A unidade contestou a execução')).toBeInTheDocument();
    expect(screen.getAllByText('Quantidade de mão de obra acima do esperado').length).toBeGreaterThan(0);
    // não há mais revisão de orçamento nem envio de orçamento
    expect(screen.queryByRole('button', { name: /Revisar orçamento|Enviar orçamento/ })).not.toBeInTheDocument();
    const lista = screen.getByRole('region', { name: 'Serviços e materiais executados' });
    expect(within(lista).getByText('Impermeabilização da laje')).toBeInTheDocument();
    expect(within(lista).getByText(/SINAPI 99001/)).toBeInTheDocument();

    const adicionar = screen.getByRole('button', { name: 'Adicionar' });
    expect(adicionar).toBeDisabled();
    expect(screen.queryByLabelText(/Valor unitário/)).not.toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText('Serviço ou material *'), 's1');
    await userEvent.type(screen.getByLabelText('Quantidade *'), '3');
    await userEvent.click(adicionar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/relatorio') && c.init?.method === 'POST')).toBe(true));
    const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/relatorio') && c.init?.method === 'POST')!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ itemSinapiId: 's1', quantidade: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reparo concluído' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/registrar-retorno'))).toBe(true));
  });

  it('não confirma o reparo concluído sem nenhum serviço informado', async () => {
    mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      '/sinapi': { body: [] },
      '/manutencoes/m1': { body: civil({ status: 'EM_EXECUCAO', linhasRelatorio: [] }) },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByRole('button', { name: 'Confirmar reparo concluído' })).toBeDisabled();
  });

  it('a unidade confirma o problema resolvido ou contesta a execução', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE', '/manutencoes/m1'),
      '/manutencoes/m1/contestar': { body: {} },
      '/manutencoes/m1/confirmar-retorno': { body: {} },
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_RETORNO', orcamentoValor: '800', linhasRelatorio: [linha()] }) },
      ...historico,
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Contestar' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Por que o problema persiste *'), 'A infiltração voltou');
    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/contestar'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/contestar'))!.init!.body as string)).toEqual({ motivo: 'A infiltração voltou' });
  });

  it('depois da confirmação da unidade, o Administrador dá a aprovação final', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/autorizar-medicao': { body: {} },
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true, custoFinal: '800', linhasRelatorio: [linha()] }) },
      ...historico,
    });
    render(<App />);

    const informacoes = (await screen.findByRole('heading', { name: 'Informações da manutenção' })).closest('section') as HTMLElement;
    expect(within(informacoes).getByText('Problema resolvido (unidade)').nextElementSibling).toHaveTextContent('Confirmado');
    expect(within(informacoes).getByText('Medição autorizada').nextElementSibling).toHaveTextContent('Pendente');

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/autorizar-medicao'))).toBe(true));
  });

  it('o Administrador pode solicitar ajustes, com motivo, em vez de aprovar', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/solicitar-ajustes': { body: {} },
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true, custoFinal: '800', linhasRelatorio: [linha()] }) },
      ...historico,
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Solicitar ajustes' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('O que precisa ser ajustado *'), 'Mão de obra acima do esperado');
    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/solicitar-ajustes'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/solicitar-ajustes'))!.init!.body as string)).toEqual({ motivo: 'Mão de obra acima do esperado' });
  });

  it('enquanto aguarda a execução pelo prestador, o Administrador não tem nenhuma ação', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_EXECUCAO', contrato: { id: 'c1', numero: 'CONT-1', prestador: { nome: 'Predial Ltda' } } }) },
      ...historico,
    });
    render(<App />);

    await screen.findByRole('heading', { name: 'Informações da manutenção' });
    expect(screen.queryByRole('button', { name: /Negar|Trocar item|Encaminhar|Aprovar|Recusar/ })).not.toBeInTheDocument();
  });

  it('o Administrador não tem ação enquanto a unidade ainda não confirmou', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_RETORNO', orcamentoValor: '800', linhasRelatorio: [linha()] }) },
      ...historico,
    });
    render(<App />);

    await screen.findByRole('heading', { name: 'Informações da manutenção' });
    expect(screen.queryByRole('button', { name: /^Aprovar$|Solicitar ajustes/ })).not.toBeInTheDocument();
  });

  it('chamado concluído mostra a data da autorização da medição', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1': {
        body: civil({
          status: 'CONCLUIDA',
          confirmadoUnidade: true,
          conferidoMedicaoEm: '2026-10-05T13:00:00.000Z',
          dataConclusao: '2026-10-05T13:00:00.000Z',
          linhasRelatorio: [linha()],
        }),
      },
      ...historico,
    });
    render(<App />);

    const informacoes = (await screen.findByRole('heading', { name: 'Informações da manutenção' })).closest('section') as HTMLElement;
    expect(within(informacoes).getByText('Problema resolvido (unidade)').nextElementSibling).toHaveTextContent('Confirmado');
    expect(within(informacoes).getByText('Medição autorizada').nextElementSibling).not.toHaveTextContent('Pendente');
  });
});
