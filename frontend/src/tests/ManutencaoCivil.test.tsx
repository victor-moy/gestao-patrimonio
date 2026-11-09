import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch, acao } from './mock-fetch';

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
  categoriaCivilId: 'cat-infiltracao',
  categoriaCivil: { id: 'cat-infiltracao', nome: 'Infiltração' },
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

const contrato = (saldo = 4500) => ({
  id: 'c1',
  numero: 'CONT-2026-001',
  prestador: { id: 'p1', nome: 'Predial Ltda' },
  status: 'ATIVO',
  itens: [
    {
      id: 'i1',
      saldo,
      servico: { id: 's1', nome: 'Manutenção predial' },
    },
  ],
});

const historico = { '/manutencoes/m1/historico': { body: [] } };

const ordem = (extra: Record<string, unknown> = {}) => ({
  id: 'os1',
  numero: 3,
  equipe: 'João e Pedro',
  dataPrevista: '2026-11-10T00:00:00.000Z',
  escopo: 'Refazer a calha do bloco B',
  geradaEm: '2026-11-06T10:00:00.000Z',
  entradaEm: null,
  saidaEm: null,
  resultado: null,
  observacaoExecucao: null,
  executadaEm: null,
  documentos: [],
  ...extra,
});

// Tipos de problema cadastrados (o mais específico vem antes: o mock casa pelo primeiro trecho que aparece na URL)
const categorias = [
  {
    id: 'cat-infiltracao',
    nome: 'Infiltração',
    ativo: true,
    ordem: 3,
    perguntas: [
      { id: 'pg1', texto: 'A infiltração é contínua?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true, ordem: 0, ativo: true },
      { id: 'pg2', texto: 'Observação sobre o local', tipo: 'TEXTO', opcoes: [], obrigatoria: false, ordem: 1, ativo: true },
    ],
  },
  { id: 'cat-eletrica', nome: 'Elétrica', ativo: true, ordem: 2, perguntas: [] },
];

afterEach(() => localStorage.clear());

describe('Manutenção civil', () => {
  it('a unidade abre o chamado com local, tipo de problema e descrição, sem escolher equipamento', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE', '/solicitacoes/nova'),
      '/manutencoes/civil/abertos': { body: [] },
      '/manutencoes/civil': { body: civil() },
      '/categorias-civis': { body: categorias },
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
    await userEvent.selectOptions(await screen.findByLabelText('Tipo de problema *'), 'cat-infiltracao');
    expect(enviar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Mancha de umidade no teto');
    // a pergunta obrigatória da categoria precisa de resposta; a opcional não
    expect(enviar).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('A infiltração é contínua? *'), 'Sim');
    expect(screen.getByLabelText('Observação sobre o local')).toBeInTheDocument();
    expect(enviar).toBeEnabled();

    await userEvent.click(enviar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/civil'))).toBe(true));
    const corpo = chamadas.find((c) => c.url.endsWith('/manutencoes/civil'))!.init!.body as FormData;
    expect(corpo.get('localAfetado')).toBe('Recepção');
    expect(corpo.get('categoriaCivilId')).toBe('cat-infiltracao');
    expect(JSON.parse(String(corpo.get('respostas')))).toEqual({ pg1: 'Sim' });
    expect(corpo.get('titulo')).toBe('Infiltração na recepção');
  });

  it('abre o chamado civil escolhendo mais de um setor da unidade', async () => {
    const chamadas = mockFetch({
      ...entrarComo('UNIDADE', '/solicitacoes/nova'),
      '/manutencoes/civil': { body: civil() },
      '/setores': { body: [{ id: 'st1', nome: 'Recepção', ativo: true }, { id: 'st2', nome: 'Farmácia', ativo: true }] },
      '/manutencoes/civil/abertos': { body: [] },
      '/categorias-civis': { body: categorias },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
    });
    render(<App />);

    await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'MANUTENCAO');
    await userEvent.selectOptions(screen.getByLabelText('Natureza'), 'CIVIL');
    expect(screen.queryByLabelText('Local afetado *')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Título'), 'Infiltração');
    await userEvent.selectOptions(await screen.findByLabelText('Tipo de problema *'), 'cat-eletrica');
    await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Mancha de umidade no teto');
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();

    await userEvent.click(await screen.findByLabelText('Setor afetado *'));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Recepção' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Farmácia' }));
    expect(enviar).toBeEnabled();
    await userEvent.click(enviar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/civil'))).toBe(true));
    const corpo = chamadas.find((c) => c.url.endsWith('/manutencoes/civil'))!.init!.body as FormData;
    expect(corpo.getAll('setorIds')).toEqual(['st1', 'st2']);
    expect(corpo.get('localAfetado')).toBeNull();
  });

  describe('abertura: chamados já abertos e outros problemas', () => {
    const aberto = { id: 'm9', numero: 9, titulo: 'Infiltração no corredor', status: 'PENDENTE_APROVACAO', localAfetado: 'Corredor', criadoEm: '2026-10-30T10:00:00.000Z', aceitaProblemas: true };
    const comProvedor = { ...aberto, id: 'm8', numero: 8, titulo: 'Infiltração no telhado', status: 'AGUARDANDO_EXECUCAO', aceitaProblemas: false };
    const rotas = (extra: Record<string, unknown> = {}) => ({
      ...entrarComo('UNIDADE', '/solicitacoes/nova'),
      '/manutencoes/civil/abertos': { body: [aberto, comProvedor] },
      '/manutencoes/m9/problemas': { status: 201, body: civil({ id: 'm9' }) },
      '/manutencoes/m1/problemas': { status: 201, body: civil() },
      '/manutencoes/civil': { body: civil() },
      '/categorias-civis': { body: categorias },
      '/equipamentos': { body: [] },
      '/unidades': { body: [] },
      '/categorias': { body: [] },
      ...extra,
    });
    const escolherCivil = async () => {
      await userEvent.selectOptions(await screen.findByLabelText('Tipo'), 'MANUTENCAO');
      await userEvent.selectOptions(screen.getByLabelText('Natureza'), 'CIVIL');
    };

    it('ao escolher o tipo de problema, lista os chamados abertos e só deixa acrescentar nos que ainda não foram ao prestador', async () => {
      const chamadas = mockFetch(rotas());
      render(<App />);
      await escolherCivil();

      await userEvent.selectOptions(await screen.findByLabelText('Tipo de problema *'), 'cat-infiltracao');

      expect(await screen.findByRole('link', { name: 'Abrir MAN-0009' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Abrir MAN-0008' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Acrescentar a este' })).toHaveLength(1);
      expect(screen.getByText('Já está com o prestador')).toBeInTheDocument();
      expect(chamadas.some((c) => c.url.includes('/manutencoes/civil/abertos?categoriaCivilId=cat-infiltracao'))).toBe(true);
    });

    it('acrescentar a um chamado existente envia o problema a ele, sem abrir outro, e vai para o chamado', async () => {
      const chamadas = mockFetch(rotas({ '/manutencoes/m9': { body: civil({ id: 'm9', numero: 9 }) }, '/manutencoes/m9/historico': { body: [] } }));
      render(<App />);
      await escolherCivil();
      await userEvent.selectOptions(await screen.findByLabelText('Tipo de problema *'), 'cat-infiltracao');
      await userEvent.click(await screen.findByRole('button', { name: 'Acrescentar a este' }));

      // o título e as perguntas deixam de valer: são os do chamado existente
      expect(screen.getByText('Acrescentando ao chamado MAN-0009')).toBeInTheDocument();
      expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('A infiltração é contínua? *')).not.toBeInTheDocument();
      const enviar = screen.getByRole('button', { name: 'Enviar' });
      expect(enviar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Outra mancha perto da janela');
      expect(enviar).toBeEnabled();
      await userEvent.click(enviar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m9/problemas'))).toBe(true));
      const corpo = chamadas.find((c) => c.url.endsWith('/manutencoes/m9/problemas'))!.init!.body as FormData;
      expect(corpo.get('descricao')).toBe('Outra mancha perto da janela');
      expect(chamadas.some((c) => c.url.endsWith('/manutencoes/civil') && c.init?.method === 'POST')).toBe(false);
    });

    it('"Adicionar problema" envia cada um ao chamado criado, depois de abri-lo', async () => {
      const chamadas = mockFetch(rotas({ '/manutencoes/civil/abertos': { body: [] } }));
      render(<App />);
      await escolherCivil();
      await userEvent.type(screen.getByLabelText('Título'), 'Infiltrações no bloco B');
      await userEvent.type(screen.getByLabelText('Local afetado *'), 'Bloco B');
      await userEvent.selectOptions(await screen.findByLabelText('Tipo de problema *'), 'cat-eletrica');
      await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Tomada da sala 1 sem energia');
      await userEvent.click(screen.getByRole('button', { name: '+ Adicionar problema' }));
      const enviar = screen.getByRole('button', { name: 'Enviar' });
      // o outro problema precisa de descrição
      expect(enviar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Descrição *'), 'Tomada da sala 2 também sem energia');
      expect(enviar).toBeEnabled();
      await userEvent.click(enviar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/problemas'))).toBe(true));
      const ordem = chamadas.filter((c) => c.init?.method === 'POST').map((c) => c.url.replace(/^.*\/manutencoes/, '/manutencoes'));
      expect(ordem).toEqual(['/manutencoes/civil', '/manutencoes/m1/problemas']);
      const extra = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/problemas'))!.init!.body as FormData;
      expect(extra.get('descricao')).toBe('Tomada da sala 2 também sem energia');
    });
  });

  describe('detalhe: respostas e outros problemas', () => {
    const comRespostas = (extra: Record<string, unknown> = {}) =>
      civil({
        respostas: [{ id: 'r1', perguntaTexto: 'A infiltração é contínua?', resposta: 'Sim', ordem: 0 }],
        problemasExtras: [{ id: 'x1', descricao: 'Mancha também na copa', fotos: [], criadoEm: '2026-10-02T10:00:00.000Z', criadoPor: { nome: 'Rodrigo' } }],
        ...extra,
      });

    it('mostra as respostas da abertura e os problemas acrescentados', async () => {
      mockFetch({ ...entrarComo('UNIDADE', '/manutencoes/m1'), '/manutencoes/m1': { body: comRespostas() }, ...historico });
      render(<App />);

      const respostas = (await screen.findByRole('heading', { name: 'Sobre o problema' })).closest('section') as HTMLElement;
      expect(within(respostas).getByText('A infiltração é contínua?').nextElementSibling).toHaveTextContent('Sim');
      const extras = screen.getByRole('heading', { name: 'Problemas adicionais' }).closest('section') as HTMLElement;
      expect(within(extras).getByText('Mancha também na copa')).toBeInTheDocument();
    });

    it('a Unidade acrescenta outro problema enquanto o chamado está na triagem', async () => {
      const chamadas = mockFetch({
        ...entrarComo('UNIDADE', '/manutencoes/m1'),
        '/manutencoes/m1/problemas': { status: 201, body: comRespostas() },
        '/manutencoes/m1': { body: comRespostas() },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: '+ Acrescentar problema' }));
      const acrescentar = screen.getByRole('button', { name: 'Acrescentar' });
      expect(acrescentar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Descrição do problema *'), 'Goteira no banheiro');
      await userEvent.click(acrescentar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/problemas'))).toBe(true));
      expect((chamadas.find((c) => c.url.endsWith('/problemas'))!.init!.body as FormData).get('descricao')).toBe('Goteira no banheiro');
    });

    it('depois de ir ao prestador não dá mais para acrescentar', async () => {
      mockFetch({ ...entrarComo('UNIDADE', '/manutencoes/m1'), '/manutencoes/m1': { body: comRespostas({ status: 'AGUARDANDO_EXECUCAO' }) }, ...historico });
      render(<App />);

      await screen.findByRole('heading', { name: 'Sobre o problema' });
      expect(screen.queryByRole('button', { name: '+ Acrescentar problema' })).not.toBeInTheDocument();
    });
  });

  it('o detalhe mostra setor e tipo de problema no lugar do equipamento', async () => {
    mockFetch({
      ...entrarComo('UNIDADE', '/manutencoes/m1'),
      '/manutencoes/m1': { body: civil() },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Infiltração na recepção' })).toBeInTheDocument();
    const informacoes = screen.getByRole('heading', { name: 'Informações da manutenção' }).closest('section') as HTMLElement;
    expect(within(informacoes).getByText('Setor afetado').nextElementSibling).toHaveTextContent('Recepção');
    expect(within(informacoes).getByText('Tipo de problema').nextElementSibling).toHaveTextContent('Infiltração');
    expect(within(informacoes).queryByText('Item')).not.toBeInTheDocument();
  });

  it('triagem: oferece itens de contrato com saldo e mostra chamados parecidos', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/similares': {
        body: [{ id: 'm9', numero: 9, titulo: 'Goteira na recepção', status: 'EM_EXECUCAO', localAfetado: 'Recepção', criadoEm: '2026-09-30T10:00:00.000Z' }],
      },
      '/manutencoes/m1/aprovar': { body: {} },
      '/manutencoes/m1': { body: civil() },
      '/contratos': { body: [contrato()] },
      ...historico,
    });
    render(<App />);

    await acao('Aprovar chamado');
    expect(await screen.findByText(/Chamados parecidos em aberto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir MAN-0009 · Goteira na recepção' })).toHaveAttribute('href', '/manutencoes/m9');
    const confirmar = screen.getByRole('button', { name: 'Confirmar aprovação' });
    expect(confirmar).toBeDisabled();
    await userEvent.selectOptions(await screen.findByLabelText('Item do contrato *'), 'i1');
    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/aprovar'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/aprovar'))!.init!.body as string)).toEqual({ contratoItemId: 'i1' });
  });

  it('item de contrato sem saldo continua escolhível: o saldo não bloqueia a triagem', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/similares': { body: [] },
      '/manutencoes/m1': { body: civil() },
      '/contratos': { body: [contrato(0)] },
      ...historico,
    });
    render(<App />);

    await acao('Aprovar chamado');
    expect(await screen.findByRole('option', { name: /Manutenção predial/ })).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum item de contrato/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/Item do contrato/), 'i1');
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeEnabled();
  });

  it('sem nenhum contrato vigente o chamado não pode ser aprovado', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/similares': { body: [] },
      '/manutencoes/m1': { body: civil() },
      '/contratos': { body: [] },
      ...historico,
    });
    render(<App />);

    await acao('Aprovar chamado');
    expect(await screen.findByText(/Nenhum item de contrato vigente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeDisabled();
  });

  describe('avaliação técnica', () => {
    const emAvaliacao = () =>
      civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItem: { id: 'i1', servico: { nome: 'Manutenção predial' } } });
    const apoio = {
      '/unidades': { body: [{ id: 'u1', nome: 'UBS Centro', ativo: true }, { id: 'u2', nome: 'UBS Norte', ativo: true }] },
      '/contratos': { body: [contrato()] },
      '/setores?unidadeId=u1': { body: [{ id: 'st1', nome: 'Recepção', ativo: true }] },
      '/sinapi': { body: [{ id: 'sn1', codigo: '123', descricao: 'Tinta acrílica', unidade: 'L', tipo: 'MATERIAL', preco: '50', referencia: '' }] },
    };

    it('corrige campos e mantém em análise', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/avaliacao': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      const salvar = await screen.findByRole('button', { name: 'Salvar e manter em análise' });
      expect(salvar).toBeDisabled();
      const titulo = screen.getByLabelText('Título');
      await userEvent.clear(titulo);
      await userEvent.type(titulo, 'Goteira na sala 2');
      await userEvent.click(await screen.findByLabelText('Setor afetado'));
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Recepção' }));
      await userEvent.type(screen.getByLabelText('Orientações para a terceirizada'), 'Levar escada');
      await userEvent.click(salvar);
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/avaliacao') && c.init?.method === 'PATCH')).toBe(true));
      expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/avaliacao'))!.init!.body as string)).toEqual({
        titulo: 'Goteira na sala 2',
        setorIds: ['st1'],
        orientacoesTerceirizada: 'Levar escada',
      });
    });

    it('adiciona item previsto da tabela SINAPI', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/materiais': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      await userEvent.type(await screen.findByLabelText('Item'), 'tinta');
      await userEvent.click(await screen.findByRole('option', { name: /Tinta acrílica/ }));
      await userEvent.type(screen.getByLabelText('Quantidade'), '3');
      await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/materiais'))).toBe(true));
      expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/materiais'))!.init!.body as string)).toEqual({ itemSinapiId: 'sn1', quantidade: 3 });
    });

    it('pedir informações devolve o chamado à triagem com o motivo', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/solicitar-informacoes': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: 'Pedir informações' }));
      const devolver = screen.getByRole('button', { name: 'Devolver à triagem' });
      expect(devolver).toBeDisabled();
      await userEvent.type(screen.getByLabelText('O que falta saber? *'), 'Qual o andar da infiltração?');
      await userEvent.click(devolver);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/solicitar-informacoes'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/solicitar-informacoes'))!.init!.body))).toEqual({ motivo: 'Qual o andar da infiltração?' });
    });

    it('marcar vistoria é direto; depois da visita registra-se o parecer e o chamado volta à avaliação', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/marcar-vistoria': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);
      await userEvent.click(await screen.findByRole('button', { name: 'Marcar vistoria' }));
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/marcar-vistoria'))).toBe(true));
    });

    it('em vistoria: registra o parecer da visita', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/registrar-vistoria': { body: {} },
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_VISTORIA', contratoItem: { id: 'i1', servico: { nome: 'Manutenção predial' } } }) },
        ...historico,
      });
      render(<App />);

      await acao('Registrar vistoria');
      const registrar = screen.getByRole('button', { name: 'Registrar e voltar à avaliação' });
      expect(registrar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Parecer da vistoria *'), 'Infiltração vem da calha');
      await userEvent.click(registrar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/registrar-vistoria'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/registrar-vistoria'))!.init!.body))).toEqual({ parecer: 'Infiltração vem da calha' });
    });

    it('depois da vistoria o parecer fica à vista de quem volta a avaliar o chamado', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', parecerVistoria: 'Infiltração vem da calha', contratoItem: { id: 'i1', servico: { nome: 'Manutenção predial' } } }) },
        ...historico,
      });
      render(<App />);

      expect(await screen.findByText('Parecer da vistoria')).toBeInTheDocument();
      expect(screen.getByText('Infiltração vem da calha')).toBeInTheDocument();
    });

    it('aprovar e devolver à triagem exige o parecer e deixa o chamado "já avaliado"', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/devolver-avaliado': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      const devolver = await screen.findByRole('button', { name: 'Aprovar e devolver à triagem' });
      expect(devolver).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Parecer da avaliação técnica *'), 'Pode seguir');
      await userEvent.click(devolver);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/devolver-avaliado'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/devolver-avaliado'))!.init!.body))).toEqual({ parecer: 'Pode seguir' });
    });

    it('na fila "já avaliados" o triador encaminha ao prestador; quem só avalia não vê a ação', async () => {
      const avaliado = civil({ status: 'AVALIADO', parecerTecnico: 'Pode seguir', contratoItem: { id: 'i1', servico: { nome: 'Manutenção predial' } } });
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/encaminhar-avaliado': { body: {} },
        '/manutencoes/m1': { body: avaliado },
        ...historico,
      });
      render(<App />);

      await acao('Encaminhar ao prestador');
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/encaminhar-avaliado'))).toBe(true));
    });

    it('triagem vê o que a avaliação pediu quando o chamado volta', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/similares': { body: [] },
        '/manutencoes/m1': { body: civil({ informacoesSolicitadas: 'Qual o andar da infiltração?' }) },
        ...historico,
      });
      render(<App />);

      expect(await screen.findByRole('heading', { name: 'A avaliação técnica pediu informações' })).toBeInTheDocument();
      expect(screen.getByText('Qual o andar da infiltração?')).toBeInTheDocument();
    });

    it('encaminhar exige o parecer e segue ao prestador', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/concluir-avaliacao': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      const encaminhar = await screen.findByRole('button', { name: 'Encaminhar ao prestador' });
      expect(encaminhar).toBeDisabled();
      await userEvent.type(screen.getByLabelText(/Parecer da avaliação técnica/), 'Reparo viável');
      await userEvent.click(encaminhar);
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/concluir-avaliacao'))).toBe(true));
      expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/concluir-avaliacao'))!.init!.body as string)).toEqual({ parecer: 'Reparo viável' });
    });

    it('duplicado pede o número do chamado original', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoio,
        '/manutencoes/m1/encerrar': { body: {} },
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: 'Encerrar chamado' }));
      await userEvent.selectOptions(screen.getByLabelText('Como encerrar'), 'DUPLICADO');
      await userEvent.type(screen.getByLabelText('Motivo *'), 'Já aberto');
      const confirmar = screen.getByRole('button', { name: 'Confirmar encerramento' });
      expect(confirmar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Chamado original (número) *'), '7');
      await userEvent.click(confirmar);
      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/encerrar'))).toBe(true));
      expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/encerrar'))!.init!.body as string)).toEqual({
        tipo: 'DUPLICADO',
        motivo: 'Já aberto',
        chamadoOriginalNumero: 7,
      });
    });

    it('quem não tem a permissão de avaliar não vê o formulário', async () => {
      mockFetch({
        ...entrarComo('UNIDADE', '/manutencoes/m1'),
        '/manutencoes/m1': { body: emAvaliacao() },
        ...historico,
      });
      render(<App />);
      await screen.findByRole('heading', { name: 'Infiltração na recepção' });
      expect(screen.queryByRole('button', { name: 'Encaminhar ao prestador' })).not.toBeInTheDocument();
    });
  });

  it('o prestador recebe o chamado aguardando execução e gera a OS (equipe, dia e escopo)', async () => {
    const chamadas = mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      '/manutencoes/m1/gerar-os': { status: 201, body: {} },
      '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_EXECUCAO', orientacoesTerceirizada: 'Levar escada' }) },
      ...historico,
    });
    render(<App />);

    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
    await acao('Gerar OS');
    const gerar = screen.getByRole('button', { name: 'Gerar OS' });
    // o escopo já vem preenchido com as orientações da avaliação; falta a equipe e o dia
    expect(screen.getByLabelText('Escopo do serviço *')).toHaveValue('Levar escada');
    expect(gerar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Equipe *'), 'João e Pedro');
    await userEvent.type(screen.getByLabelText('Dia da visita *'), '2026-11-10');
    expect(gerar).toBeEnabled();
    await userEvent.click(gerar);

    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/gerar-os') && c.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/gerar-os'))!.init!.body))).toEqual({
      equipe: 'João e Pedro',
      dataPrevista: '2026-11-10',
      escopo: 'Levar escada',
    });
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
          contratoItem: { id: 'ci1', valor: '20000', descontoPercentual: '12', servico: { nome: 'Predial' } },
          linhasRelatorio: [linha()],
          ordemServico: ordem(),
        }),
      },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByText('A unidade contestou a execução')).toBeInTheDocument();
    expect(screen.getAllByText('Quantidade de mão de obra acima do esperado').length).toBeGreaterThan(0);
    // não há mais revisão de orçamento nem envio de orçamento
    expect(screen.queryByRole('button', { name: /Revisar orçamento|Enviar orçamento/ })).not.toBeInTheDocument();
    const lista = screen.getByRole('region', { name: 'Itens executados' });
    expect(within(lista).getByText('Impermeabilização da laje')).toBeInTheDocument();
    expect(within(lista).getByText(/SINAPI 99001/)).toBeInTheDocument();
    // o prestador lança itens e quantidades, mas não vê preço, desconto nem total
    expect(within(lista).queryByRole('columnheader', { name: /Valor unit|Total/ })).not.toBeInTheDocument();
    expect(within(lista).queryByText(/12% de desconto|R\$/)).not.toBeInTheDocument();

    const adicionar = screen.getByRole('button', { name: 'Adicionar' });
    expect(adicionar).toBeDisabled();
    expect(screen.queryByLabelText(/Valor unitário/)).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText('Item *'), 'sifão');
    await userEvent.click(await screen.findByRole('option', { name: /Troca de sifão/ }));
    await userEvent.type(screen.getByLabelText('Quantidade *'), '3');
    await userEvent.click(adicionar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/relatorio') && c.init?.method === 'POST')).toBe(true));
    const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/relatorio') && c.init?.method === 'POST')!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ itemSinapiId: 's1', quantidade: 3 });

    // depois de ajustes do fiscal os dados da execução já estão na OS: reenvia direto
    await acao('Marcar como executado');
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/registrar-retorno'))).toBe(true));
  });

  it('não confirma o reparo concluído sem nenhum serviço informado', async () => {
    mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      '/sinapi': { body: [] },
      '/manutencoes/m1': { body: civil({ status: 'EM_EXECUCAO', linhasRelatorio: [], ordemServico: ordem() }) },
      ...historico,
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: /Marcar como executado/ })).toBeDisabled();
  });

  describe('orçamento prévio (PDFs enviados pelo prestador)', () => {
    const cot = (n: number, extra: Record<string, unknown> = {}) => ({
      id: `c${n}`,
      rodada: 1,
      arquivo: `/uploads/laudos/c${n}.pdf`,
      enviadoEm: '2026-11-06T10:00:00.000Z',
      ...extra,
    });
    const item = { id: 'i1', servico: { nome: 'Cobertura', exigeOrcamentoPrevio: true } };
    const apoioAval = {
      '/unidades': { body: [{ id: 'u1', nome: 'UBS Centro', ativo: true }] },
      '/contratos': { body: [contrato()] },
      '/setores?unidadeId=u1': { body: [] },
      '/sinapi': { body: [] },
      '/categorias-civis': { body: categorias },
    };

    it('serviço que exige orçamento: a avaliação não encaminha ao prestador; pede o orçamento com instruções', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoioAval,
        '/manutencoes/m1/solicitar-orcamento': { body: {} },
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItem: item }) },
        ...historico,
      });
      render(<App />);

      expect(await screen.findByText(/exige orçamento prévio/)).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText('Parecer da avaliação técnica *'), 'Telhado comprometido');
      expect(screen.getByRole('button', { name: 'Encaminhar ao prestador' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Aprovar e devolver à triagem' })).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: 'Solicitar orçamento' }));
      const enviar = screen.getByRole('button', { name: 'Solicitar orçamento' });
      expect(enviar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('O que o prestador deve orçar? *'), 'Troca de 40 m² de telha');
      await userEvent.click(enviar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/solicitar-orcamento'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/solicitar-orcamento'))!.init!.body))).toEqual({ instrucoes: 'Troca de 40 m² de telha' });
    });

    it('risco à vida: encaminha sem orçamento só com justificativa de verdade', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoioAval,
        '/manutencoes/m1/dispensar-orcamento': { body: {} },
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItem: item }) },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: 'Encaminhar sem orçamento (risco à vida)' }));
      const confirmar = screen.getByRole('button', { name: 'Encaminhar sem orçamento' });
      await userEvent.type(screen.getByLabelText('Qual o risco à vida? *'), 'urgente');
      expect(confirmar).toBeDisabled(); // curta demais
      await userEvent.clear(screen.getByLabelText('Qual o risco à vida? *'));
      await userEvent.type(screen.getByLabelText('Qual o risco à vida? *'), 'Telhado prestes a cair sobre a sala de espera');
      await userEvent.click(confirmar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/dispensar-orcamento'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/dispensar-orcamento'))!.init!.body))).toEqual({
        justificativa: 'Telhado prestes a cair sobre a sala de espera',
      });
    });

    it('serviço sem a exigência continua encaminhando normalmente e não oferece a dispensa', async () => {
      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        ...apoioAval,
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItem: { id: 'i1', servico: { nome: 'Predial', exigeOrcamentoPrevio: false } } }) },
        ...historico,
      });
      render(<App />);

      await userEvent.type(await screen.findByLabelText('Parecer da avaliação técnica *'), 'Pode seguir');
      expect(screen.getByRole('button', { name: 'Encaminhar ao prestador' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: /sem orçamento/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Solicitar orçamento' })).toBeInTheDocument(); // dá para pedir mesmo assim (fora da SINAPI)
    });

    it('o prestador anexa os PDFs do orçamento e envia numa única entrega', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1/cotacoes': { status: 201, body: {} },
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_ORCAMENTO', rodadaOrcamento: 1, instrucoesOrcamento: 'Troca de 40 m² de telha' }) },
        ...historico,
      });
      render(<App />);

      expect(await screen.findByText('Troca de 40 m² de telha')).toBeInTheDocument();
      const enviar = screen.getByRole('button', { name: 'Enviar orçamento' });
      expect(enviar).toBeDisabled();
      await userEvent.upload(screen.getByLabelText('Orçamento (PDF) *'), [
        new File(['%PDF-1.4'], 'orcamento-a.pdf', { type: 'application/pdf' }),
        new File(['%PDF-1.4'], 'orcamento-b.pdf', { type: 'application/pdf' }),
      ]);
      expect(screen.getByText('orcamento-a.pdf')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Remover orcamento-b.pdf' }));
      expect(screen.queryByText('orcamento-b.pdf')).not.toBeInTheDocument();
      expect(enviar).toBeEnabled();
      await userEvent.click(enviar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/cotacoes') && c.init?.method === 'POST')).toBe(true));
      const dados = chamadas.find((c) => c.url.endsWith('/cotacoes'))!.init!.body as FormData;
      expect((dados.getAll('arquivos') as File[]).map((f) => f.name)).toEqual(['orcamento-a.pdf']);
    });

    it('rodada nova: mostra por que o orçamento foi rejeitado e guarda os envios anteriores', async () => {
      mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1': {
          body: civil({ status: 'AGUARDANDO_ORCAMENTO', rodadaOrcamento: 2, motivoRejeicaoOrcamento: 'Valores acima do mercado', cotacoes: [cot(1), cot(2)] }),
        },
        ...historico,
      });
      render(<App />);

      expect(await screen.findByText('Valores acima do mercado')).toBeInTheDocument();
      expect(screen.getByText('Envios anteriores')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar orçamento' })).toBeInTheDocument();
    });

    it('o fiscal informa o valor aprovado e aprova; o prestador não vê esses botões', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/aprovar-cotacao': { body: {} },
        '/manutencoes/m1': { body: civil({ status: 'ORCAMENTO_REGISTRADO', rodadaOrcamento: 1, cotacoes: [cot(1), cot(2)] }) },
        ...historico,
      });
      render(<App />);

      const aprovar = await screen.findByRole('button', { name: 'Aprovar orçamento' });
      expect(aprovar).toBeDisabled(); // sem valor
      expect(screen.getAllByRole('button', { name: /Orçamento \d \(PDF\)/ })).toHaveLength(2);
      await userEvent.type(screen.getByLabelText('Valor aprovado (R$) *'), '12500.50');
      await userEvent.click(aprovar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/aprovar-cotacao'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/aprovar-cotacao'))!.init!.body))).toEqual({ valor: 12500.5 });
    });

    it('o fiscal pode rejeitar o orçamento com o motivo', async () => {
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/rejeitar-cotacoes': { body: {} },
        '/manutencoes/m1': { body: civil({ status: 'ORCAMENTO_REGISTRADO', rodadaOrcamento: 1, cotacoes: [cot(1)] }) },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: 'Rejeitar' }));
      const rejeitar = screen.getByRole('button', { name: 'Rejeitar orçamento' });
      expect(rejeitar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Motivo da rejeição *'), 'Valores acima do mercado');
      await userEvent.click(rejeitar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/rejeitar-cotacoes'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/rejeitar-cotacoes'))!.init!.body))).toEqual({ motivo: 'Valores acima do mercado' });
    });

    it('quem não é fiscal vê que o orçamento aguarda decisão mas não decide; chamado dispensado mostra a justificativa', async () => {
      mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1': { body: civil({ status: 'ORCAMENTO_REGISTRADO', rodadaOrcamento: 1, cotacoes: [cot(1)] }) },
        ...historico,
      });
      const { unmount } = render(<App />);
      expect(await screen.findByText(/aguarda a decisão do fiscal/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aprovar orçamento' })).not.toBeInTheDocument();
      unmount();

      mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1': { body: civil({ status: 'AGUARDANDO_EXECUCAO', dispensaOrcamentoMotivo: 'Telhado prestes a cair' }) },
        ...historico,
      });
      render(<App />);
      expect(await screen.findByText('Orçamento dispensado por risco à vida')).toBeInTheDocument();
      expect(screen.getByText('Telhado prestes a cair')).toBeInTheDocument();
    });
  });

  describe('ordem de serviço e documentação', () => {
    const emRota = (extra: Record<string, unknown> = {}) =>
      civil({ status: 'EM_EXECUCAO', linhasRelatorio: [linha()], ordemServico: ordem(), ...extra });

    it('a OS não é um card do detalhe; "Imprimir OS" fica no menu Ações', async () => {
      mockFetch({ ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'), '/sinapi': { body: [] }, '/manutencoes/m1': { body: emRota() }, ...historico });
      render(<App />);

      await screen.findByRole('button', { name: /Ações/ });
      expect(screen.queryByRole('heading', { name: 'Ordem de serviço OS-0003' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /Ações/ }));
      expect(await screen.findByRole('menuitem', { name: 'Imprimir OS' })).toBeInTheDocument();
    });

    it('marcar como executado pede entrada, saída e resultado (a saída tem de ser depois da entrada)', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/sinapi': { body: [] },
        '/manutencoes/m1/registrar-retorno': { body: {} },
        '/manutencoes/m1': { body: emRota() },
        ...historico,
      });
      render(<App />);

      await acao('Marcar como executado');
      const marcar = screen.getByRole('button', { name: 'Marcar como executado' });
      expect(marcar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Entrada na unidade *'), '2026-11-05T11:00');
      await userEvent.type(screen.getByLabelText('Saída da unidade *'), '2026-11-05T09:00');
      await userEvent.selectOptions(screen.getByLabelText('Resultado *'), 'PARCIAL');
      expect(marcar).toBeDisabled(); // saída antes da entrada
      await userEvent.clear(screen.getByLabelText('Saída da unidade *'));
      await userEvent.type(screen.getByLabelText('Saída da unidade *'), '2026-11-05T12:30');
      await userEvent.type(screen.getByLabelText('Observação'), 'Faltou material');
      expect(marcar).toBeEnabled();
      await userEvent.click(marcar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/registrar-retorno'))).toBe(true));
      const corpo = JSON.parse(String(chamadas.find((c) => c.url.endsWith('/registrar-retorno'))!.init!.body));
      expect(corpo).toMatchObject({ resultado: 'PARCIAL', observacao: 'Faltou material' });
      expect(new Date(corpo.entradaEm).getTime()).toBeLessThan(new Date(corpo.saidaEm).getTime());
    });

    it('executado: o prestador envia a OS assinada; depois de enviada ela não pode ser trocada', async () => {
      const chamadas = mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1/documentos': { status: 201, body: {} },
        '/manutencoes/m1': { body: emRota({ status: 'EXECUTADO', ordemServico: ordem({ executadaEm: '2026-11-05T12:30:00.000Z', resultado: 'TOTAL', documentos: [] }) }) },
        ...historico,
      });
      render(<App />);

      const os = (await screen.findByRole('group', { name: 'OS assinada' })) as HTMLElement;
      expect(within(os).getByText(/^Pendente/)).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Relatório de execução' })).not.toBeInTheDocument();

      const arquivo = new File(['%PDF-1.4'], 'os.pdf', { type: 'application/pdf' });
      await userEvent.upload(screen.getByLabelText('Arquivo da OS assinada'), arquivo);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/documentos') && c.init?.method === 'POST')).toBe(true));
      const dados = chamadas.find((c) => c.url.endsWith('/documentos'))!.init!.body as FormData;
      expect(dados.get('tipo')).toBe('OS_ASSINADA');
      expect((dados.get('arquivo') as File).name).toBe('os.pdf');
    });

    it('com a OS assinada já enviada não há mais o que enviar', async () => {
      mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1': {
          body: emRota({
            status: 'EXECUTADO',
            ordemServico: ordem({
              executadaEm: '2026-11-05T12:30:00.000Z',
              resultado: 'TOTAL',
              documentos: [{ id: 'd1', tipo: 'OS_ASSINADA', arquivo: '/uploads/laudos/a.pdf', enviadoEm: '2026-11-05T13:00:00.000Z', recusadoEm: null, motivoRecusa: null }],
            }),
          }),
        },
        ...historico,
      });
      render(<App />);

      const os = (await screen.findByRole('group', { name: 'OS assinada' })) as HTMLElement;
      expect(within(os).getByText(/Enviado em/)).toBeInTheDocument();
      expect(within(os).queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();
    });

    it('o fiscal recusa a OS assinada com motivo, pelo menu Ações', async () => {
      const docs = [{ id: 'd1', tipo: 'OS_ASSINADA', arquivo: '/uploads/laudos/a.pdf', enviadoEm: '2026-11-05T13:00:00.000Z', recusadoEm: null, motivoRecusa: null }];
      const corpo = emRota({ status: 'AGUARDANDO_RETORNO', ordemServico: ordem({ executadaEm: '2026-11-05T12:30:00.000Z', documentos: docs }) });
      const chamadas = mockFetch({
        ...entrarComo('OPERADOR', '/manutencoes/m1'),
        '/manutencoes/m1/documentos/d1/recusar': { body: {} },
        '/manutencoes/m1': { body: corpo },
        ...historico,
      });
      render(<App />);

      await acao('Recusar OS assinada');
      const confirmar = screen.getByRole('button', { name: 'Confirmar recusa' });
      expect(confirmar).toBeDisabled();
      await userEvent.type(screen.getByLabelText('Motivo da recusa *'), 'Sem a assinatura');
      await userEvent.click(confirmar);

      await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/documentos/d1/recusar'))).toBe(true));
      expect(JSON.parse(String(chamadas.find((c) => c.url.endsWith('/recusar'))!.init!.body))).toEqual({ motivo: 'Sem a assinatura' });
    });

    it('quem não é fiscal não vê "Recusar OS assinada" nas ações', async () => {
      const docs = [{ id: 'd1', tipo: 'OS_ASSINADA', arquivo: '/uploads/laudos/a.pdf', enviadoEm: '2026-11-05T13:00:00.000Z', recusadoEm: null, motivoRecusa: null }];
      mockFetch({
        ...entrarComo('UNIDADE', '/manutencoes/m1'),
        '/manutencoes/m1': { body: emRota({ status: 'AGUARDANDO_RETORNO', ordemServico: ordem({ executadaEm: '2026-11-05T12:30:00.000Z', documentos: docs }) }) },
        ...historico,
      });
      render(<App />);

      await userEvent.click(await screen.findByRole('button', { name: 'Ações' }));
      expect(await screen.findByRole('menuitem', { name: 'Problema resolvido' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Recusar OS assinada' })).not.toBeInTheDocument();
    });

    it('documento recusado mostra o motivo e volta a ficar pendente', async () => {
      const docs = [{ id: 'd1', tipo: 'OS_ASSINADA', arquivo: '/uploads/laudos/a.pdf', enviadoEm: '2026-11-05T13:00:00.000Z', recusadoEm: '2026-11-06T09:00:00.000Z', motivoRecusa: 'PDF ilegível' }];
      mockFetch({
        ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
        '/manutencoes/m1': { body: emRota({ status: 'EXECUTADO', ordemServico: ordem({ executadaEm: '2026-11-05T12:30:00.000Z', documentos: docs }) }) },
        ...historico,
      });
      render(<App />);

      const os = await screen.findByRole('group', { name: 'OS assinada' });
      expect(within(os).getByText(/PDF ilegível/)).toBeInTheDocument();
      expect(within(os).getByText(/^Pendente/)).toBeInTheDocument();
      expect(within(os).getByRole('button', { name: /Enviar os assinada/ })).toBeInTheDocument();
    });

    it('chamado que já estava em execução sem OS oferece gerar a OS', async () => {
      mockFetch({ ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'), '/sinapi': { body: [] }, '/manutencoes/m1': { body: civil({ status: 'EM_EXECUCAO', linhasRelatorio: [linha()] }) }, ...historico });
      render(<App />);

      await acao('Gerar OS');
      expect(screen.getByRole('button', { name: 'Gerar OS' })).toBeInTheDocument();
    });
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

    await acao('Contestar');
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Por que o problema persiste *'), 'A infiltração voltou');
    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/contestar'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/contestar'))!.init!.body as string)).toEqual({ motivo: 'A infiltração voltou' });
  });

  it('a unidade vê o prazo de 7 dias e que contestar abre um novo chamado na triagem', async () => {
    mockFetch({
      ...entrarComo('UNIDADE', '/manutencoes/m1'),
      '/manutencoes/m1': {
        body: civil({ status: 'AGUARDANDO_RETORNO', aguardandoRetornoEm: '2026-11-01T12:00:00.000Z', linhasRelatorio: [linha()] }),
      },
      ...historico,
    });
    render(<App />);

    const aviso = await screen.findByText(/dado como resolvido automaticamente/);
    expect(aviso).toHaveTextContent('até 08/11/2026');
    expect(aviso).toHaveTextContent('um novo chamado é aberto na triagem');
  });

  it('o Administrador vê quando a resolução foi automática', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1': {
        body: civil({
          status: 'AGUARDANDO_MEDICAO',
          confirmadoUnidade: true,
          resolvidoAutomaticamenteEm: '2026-11-08T06:10:00.000Z',
          custoFinal: '500',
          linhasRelatorio: [linha()],
        }),
      },
      ...historico,
    });
    render(<App />);

    expect(await screen.findByText(/não respondeu em 7 dias e o chamado foi dado como resolvido/)).toBeInTheDocument();
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

    await acao('Aprovar');
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

    await acao('Solicitar ajustes');
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
