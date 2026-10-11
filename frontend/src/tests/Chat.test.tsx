import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const usuario = {
  id: 'u1',
  nome: 'Ana Unidade',
  email: 'ana@joinville.sc.gov.br',
  matricula: '10004',
  perfil: 'UNIDADE',
  unidadeId: 'un1',
  unidadeNome: 'UBS Norte',
};

const manutencao = {
  id: 'm1',
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
  unidade: { id: 'un1', nome: 'UBS Norte' },
  solicitante: { nome: 'Ana Unidade' },
  contrato: null,
};

const mensagens = [
  { id: 'a', texto: 'Podem enviar o orçamento?', criadoEm: '2026-10-10T10:00:00Z', autor: { id: 'g1', nome: 'Carla Fiscal', perfil: 'GESTOR_MANUTENCAO' } },
  { id: 'b', texto: 'Enviado hoje.', criadoEm: '2026-10-10T10:05:00Z', autor: { id: 'u1', nome: 'Ana Unidade', perfil: 'UNIDADE' } },
];

function rotas(chat: Record<string, unknown>, caminho = '/conversas/manutencao/m1') {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', caminho);
  // O mock usa a primeira chave contida na URL: a rota do chat precisa vir antes de '/manutencoes/m1'
  return {
    '/manutencoes/m1/mensagens': chat,
    '/conversas': { body: [] },
    '/auth/me': { body: usuario },
    '/manutencoes/m1/historico': { body: [] },
    '/manutencoes/m1': { body: manutencao },
    '/dashboard/alertas': { body: [] },
  } as unknown as Parameters<typeof mockFetch>[0];
}

describe('Botão Conversar nos detalhes', () => {
  afterEach(() => localStorage.clear());

  it('a manutenção tem um botão que leva à tela de conversa e não exibe o chat embutido', async () => {
    mockFetch(rotas({ body: mensagens }, '/manutencoes/m1'));
    render(<App />);
    const botao = await screen.findByRole('link', { name: 'Conversar' });
    expect(botao).toHaveAttribute('href', '/conversas/manutencao/m1');
    expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument();
  });
});

describe('Chat da manutenção', () => {
  afterEach(() => localStorage.clear());

  it('mostra a conversa, identifica as próprias mensagens e permite enviar', async () => {
    const chamadas = mockFetch(
      rotas(((init?: RequestInit) =>
        init?.method === 'POST'
          ? {
              status: 201,
              body: { id: 'c', texto: 'Obrigada!', criadoEm: '2026-10-10T10:10:00Z', autor: { id: 'u1', nome: 'Ana Unidade', perfil: 'UNIDADE' } },
            }
          : { body: mensagens }) as never),
    );
    render(<App />);

    const lista = await screen.findByRole('list', { name: 'Mensagens da conversa' });
    expect(within(lista).getByText('Podem enviar o orçamento?')).toBeInTheDocument();
    expect(within(lista).getByText('Carla Fiscal')).toBeInTheDocument();
    expect(within(lista).getByText('Você')).toBeInTheDocument();

    const botao = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(botao).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Mensagem'), '  Obrigada!  ');
    await userEvent.click(botao);

    await waitFor(() => {
      const post = chamadas.find((c) => c.url.includes('/manutencoes/m1/mensagens') && c.init?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.init!.body))).toEqual({ texto: 'Obrigada!' });
    });
    expect(await within(lista).findByText('Obrigada!')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  });

  it('mostra estado vazio quando ainda não há mensagens', async () => {
    mockFetch(rotas({ body: [] }));
    render(<App />);
    expect(await screen.findByText(/Nenhuma mensagem ainda/)).toBeInTheDocument();
  });

  it('mostra o erro de carregamento com tentativa de novo, sem fingir conversa vazia', async () => {
    mockFetch(rotas({ status: 500, body: { mensagem: 'Falha no servidor' } }));
    render(<App />);
    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma mensagem ainda/)).not.toBeInTheDocument();
  });

  it('exibe a falha de envio e mantém o texto digitado', async () => {
    mockFetch(
      rotas(((init?: RequestInit) =>
        init?.method === 'POST' ? { status: 429, body: { mensagem: 'Aguarde um instante.' } } : { body: [] }) as never),
    );
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Mensagem'), 'Olá');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Aguarde um instante.'));
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Olá');
  });
});

describe('Tela de conversas', () => {
  afterEach(() => localStorage.clear());

  const resumo = {
    contexto: 'solicitacao',
    id: 's1',
    tipoSolicitacao: 'AMPLIACAO',
    item: 'Autoclave',
    unidade: 'UBS Norte',
    ultimaEm: '2026-10-10T10:05:00Z',
    ultimoTexto: 'Enviado hoje.',
    ultimoAutor: 'Ana Unidade',
  };

  function abrir(caminho: string) {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', caminho);
    // as rotas mais específicas vêm primeiro: o mock usa a primeira chave contida na URL
    mockFetch({
      '/solicitacoes/s1/mensagens': { body: mensagens },
      '/conversas': { body: [resumo] },
      '/auth/me': { body: usuario },
      '/dashboard/alertas': { body: [] },
    });
  }

  it('lista as conversas no menu lateral e abre a conversa em tela dedicada', async () => {
    abrir('/conversas/solicitacao/s1');
    render(<App />);

    const menu = await screen.findByRole('navigation', { name: 'Conversas' });
    expect(await within(menu).findByRole('link', { name: 'Ampliação · Autoclave' })).toHaveAttribute('href', '/conversas/solicitacao/s1');
    expect(await screen.findByRole('heading', { name: 'Ampliação · Autoclave' })).toBeInTheDocument();
    expect(await screen.findByText('Podem enviar o orçamento?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver solicitação' })).toHaveAttribute('href', '/solicitacoes/s1');
    expect(screen.getByRole('link', { name: 'Fechar conversas' })).toHaveAttribute('href', '/');
  });

  it('o índice mostra a lista com a última mensagem', async () => {
    abrir('/conversas');
    render(<App />);
    expect(await screen.findByText(/Ana Unidade: Enviado hoje\./)).toBeInTheDocument();
  });

  it('o menu principal tem o item Conversas', async () => {
    abrir('/');
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Conversas' })).toHaveAttribute('href', '/conversas');
  });
});
