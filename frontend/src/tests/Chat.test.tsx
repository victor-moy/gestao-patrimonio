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
  { id: 'a', texto: 'Podem enviar o orçamento?', criadoEm: '2026-10-10T10:00:00Z', autor: { id: 'g1', nome: 'Carla Fiscal', perfil: 'OPERADOR' } },
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
      const post = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/mensagens') && c.init?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(String(post!.init!.body))).toEqual({ texto: 'Obrigada!' });
    });
    expect(await within(lista).findByText('Obrigada!')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
  });

  it('ao abrir a conversa marca como lida até a última mensagem exibida', async () => {
    const chamadas = mockFetch(rotas({ body: mensagens }));
    render(<App />);
    await screen.findByRole('list', { name: 'Mensagens da conversa' });
    await waitFor(() => {
      const lida = chamadas.find((c) => c.url.endsWith('/manutencoes/m1/mensagens/lida') && c.init?.method === 'POST');
      expect(lida).toBeTruthy();
      expect(JSON.parse(String(lida!.init!.body))).toEqual({ ate: '2026-10-10T10:05:00Z' });
    });
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
    numero: 12,
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
    expect(await within(menu).findByRole('link', { name: 'SOL-0012' })).toHaveAttribute('href', '/conversas/solicitacao/s1');
    expect(await screen.findByRole('heading', { name: 'SOL-0012' })).toBeInTheDocument();
    expect(screen.queryByText('Ampliação · Autoclave')).not.toBeInTheDocument();
    expect(await screen.findByText('Podem enviar o orçamento?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver solicitação' })).toHaveAttribute('href', '/solicitacoes/s1');
    expect(screen.getByRole('link', { name: 'Fechar conversas' })).toHaveAttribute('href', '/');
  });

  it('conversa ainda sem mensagens: o título é o número do pedido, não o nome genérico', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/conversas/manutencao/m9');
    mockFetch({
      '/manutencoes/m9/mensagens': { body: [] },
      '/manutencoes/m9': { body: { id: 'm9', numero: 3, equipamento: { descricao: 'Microscópio', tipoEquipamento: { nome: 'Microscópio' } } } },
      '/conversas': { body: [] },
      '/auth/me': { body: usuario },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'MAN-0003' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Manutenção' })).not.toBeInTheDocument();
  });

  it('ao enviar a primeira mensagem, a conversa aparece no menu lateral sem recarregar a página', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/conversas/manutencao/m9');
    let enviada = false;
    const nova = { id: 'x', texto: 'Olá', criadoEm: '2026-10-10T10:10:00Z', autor: { id: 'u1', nome: 'Ana Unidade', perfil: 'UNIDADE' } };
    mockFetch({
      '/manutencoes/m9/mensagens': (init?: RequestInit) => {
        if (init?.method === 'POST') {
          enviada = true;
          return { status: 201, body: nova };
        }
        return { body: [] };
      },
      '/manutencoes/m9': { body: { id: 'm9', numero: 3 } },
      '/conversas': () => ({
        body: enviada
          ? [{ contexto: 'manutencao', id: 'm9', numero: 3, tipoSolicitacao: null, item: 'Microscópio', unidade: 'UBS Norte', ultimaEm: nova.criadoEm, ultimoTexto: 'Olá', ultimoAutor: 'Ana Unidade' }]
          : [],
      }),
      '/auth/me': { body: usuario },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);

    const menu = await screen.findByRole('navigation', { name: 'Conversas' });
    expect(await within(menu).findByText('Nenhuma conversa ainda')).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText('Mensagem'), 'Olá');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(await within(menu).findByRole('link', { name: 'MAN-0003' })).toHaveAttribute('href', '/conversas/manutencao/m9');
  });

  it('mostra as não lidas no menu, no item da conversa e no título da aba, e some ao ler', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/conversas');
    let lida = false;
    mockFetch({
      '/solicitacoes/s1/mensagens/lida': () => {
        lida = true;
        return { status: 204, body: null };
      },
      '/solicitacoes/s1/mensagens': { body: mensagens },
      '/conversas/nao-lidas': () => ({ body: { total: lida ? 0 : 3, conversas: lida ? 0 : 1 } }),
      '/conversas': () => ({ body: [{ ...resumo, numero: 12, naoLidas: lida ? 0 : 3 }] }),
      '/auth/me': { body: usuario },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);

    // sem abrir a conversa: contador no menu, item em destaque e título da aba
    const menu = await screen.findByRole('navigation', { name: 'Conversas' });
    expect(await within(menu).findByRole('link', { name: /SOL-0012.*3 mensagens não lidas/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Conversas.*3 mensagens não lidas/ })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('(3) Gestão Patrimonial'));

    // abrir a conversa marca como lida e zera os indicadores sem recarregar a página
    await userEvent.click(within(menu).getByRole('link', { name: /SOL-0012/ }));
    await screen.findByText('Podem enviar o orçamento?');
    await waitFor(() => expect(document.title).toBe('Gestão Patrimonial'));
    expect(within(menu).getByRole('link', { name: 'SOL-0012' })).toBeInTheDocument();
  });

  it('sem conversa aberta, o computador mostra o convite para escolher uma e a lista fica no menu lateral', async () => {
    abrir('/conversas');
    render(<App />);
    expect(await screen.findByText('Selecione uma conversa para ler')).toBeInTheDocument();
    const menu = await screen.findByRole('navigation', { name: 'Conversas' });
    expect(await within(menu).findByRole('link', { name: 'SOL-0012' })).toBeInTheDocument();
  });

  it('sem nenhuma conversa, mostra o estado vazio em vez do convite', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/conversas');
    mockFetch({
      '/conversas/nao-lidas': { body: { total: 0, conversas: 0 } },
      '/conversas': { body: [] },
      '/auth/me': { body: usuario },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);
    expect((await screen.findAllByText(/Nenhuma conversa ainda/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Selecione uma conversa para ler')).not.toBeInTheDocument();
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
