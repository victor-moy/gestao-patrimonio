import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';
import { caminhoSuporte, codigoSuporte, telaDeOrigem } from '../utils/relato';

function usuarioLogado(perfil: string, extra: Record<string, unknown> = {}) {
  localStorage.setItem('sgp_token', 'token-teste');
  return {
    '/auth/me': {
      body: { id: 'u1', nome: 'Ana Teste', email: 'ana@joinville.sc.gov.br', matricula: '1', perfil, unidadeId: null, unidadeNome: null, ...extra },
    },
  };
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

const chamado = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  numero: 7,
  perfil: 'UNIDADE',
  categoria: 'BUG',
  titulo: 'Estoque em branco',
  tela: '/estoque',
  esperado: 'Ver a lista',
  aconteceu: 'A tela do estoque ficou em branco',
  navegador: 'Chrome',
  anexos: [],
  status: 'ABERTO',
  resolvidoEm: null,
  criadoEm: '2026-11-12T15:00:00.000Z',
  atualizadoEm: '2026-11-12T16:00:00.000Z',
  usuario: { id: 'u2', nome: 'Rodrigo Unidade', email: 'rodrigo@joinville.sc.gov.br' },
  _count: { mensagens: 0 },
  ...extra,
});

describe('Chamado de suporte — utilitários', () => {
  it('só aceita caminhos internos como tela de origem, e nunca as páginas do próprio suporte', () => {
    expect(telaDeOrigem('/solicitacoes/nova')).toBe('/solicitacoes/nova');
    expect(telaDeOrigem('https://exemplo.com')).toBe('/');
    expect(telaDeOrigem('//exemplo.com')).toBe('/');
    expect(telaDeOrigem('/suporte/novo?de=/x')).toBe('/');
    expect(telaDeOrigem('/suporte/abc')).toBe('/');
    expect(telaDeOrigem(null)).toBe('/');
  });

  it('o item Suporte leva a tela atual; dentro do suporte mantém a origem ou volta à lista', () => {
    expect(caminhoSuporte('/estoque', '?a=1')).toBe('/suporte?de=%2Festoque%3Fa%3D1');
    expect(caminhoSuporte('/suporte', '?de=%2Festoque')).toBe('/suporte?de=%2Festoque');
    expect(caminhoSuporte('/suporte/novo', '?de=%2Festoque')).toBe('/suporte?de=%2Festoque');
    expect(caminhoSuporte('/suporte/r1', '')).toBe('/suporte');
  });

  it('o protocolo tem 4 dígitos', () => {
    expect(codigoSuporte(7)).toBe('SUP-0007');
    expect(codigoSuporte(12345)).toBe('SUP-12345');
  });
});

describe('Chamado de suporte — abertura', () => {
  it('Suporte, no menu do usuário, abre a lista com o botão Novo chamado, que leva ao formulário; a melhoria não pede "o que esperava" e o envio vai para o chamado criado', async () => {
    const chamadas = mockFetch({ ...usuarioLogado('UNIDADE'), '/relatos/meus': { body: [] }, '/relatos/r9': { body: chamado({ id: 'r9' }) }, '/relatos': { status: 201, body: { id: 'r9' } } });
    window.history.pushState(null, '', '/inventario');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));
    // um item só no menu
    expect(screen.queryByRole('link', { name: /Abrir chamado de suporte/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Meus chamados de suporte/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Suporte' }));
    expect(await screen.findByRole('heading', { name: 'Meus chamados de suporte' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Novo chamado' }));

    expect(await screen.findByLabelText('Tela de origem')).toHaveValue('/inventario');
    expect(screen.getByLabelText('Categoria')).toHaveValue('BUG');
    expect(screen.getByLabelText('O que você esperava que acontecesse (opcional)')).toBeInTheDocument();
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Categoria'), 'MELHORIA');
    expect(screen.queryByLabelText('O que você esperava que acontecesse (opcional)')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Título'), 'Filtro por data no inventário');
    expect(enviar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Descrição'), 'Seria bom filtrar por data de cadastro');
    const print = new File([new Uint8Array(10)], 'print.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Escolher arquivos'), print);
    await userEvent.click(enviar);

    await waitFor(() => expect(window.location.pathname).toBe('/suporte/r9'));
    const envio = chamadas.find((c) => c.url.endsWith('/relatos') && c.init?.method === 'POST')!;
    const dados = envio.init!.body as FormData;
    expect(dados.get('categoria')).toBe('MELHORIA');
    expect(dados.get('titulo')).toBe('Filtro por data no inventário');
    expect(dados.get('tela')).toBe('/inventario');
    expect(dados.get('esperado')).toBeNull();
    expect(dados.get('aconteceu')).toBe('Seria bom filtrar por data de cadastro');
    expect((dados.getAll('anexos') as File[]).map((f) => f.name)).toEqual(['print.png']);
  });

  it('o bug envia também o que se esperava', async () => {
    const chamadas = mockFetch({ ...usuarioLogado('UNIDADE'), '/relatos/r9': { body: chamado() }, '/relatos': { status: 201, body: { id: 'r9' } } });
    window.history.pushState(null, '', '/suporte/novo?de=%2F');
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Título'), 'Botão não responde');
    await userEvent.type(screen.getByLabelText('O que você esperava que acontecesse (opcional)'), 'Salvar o pedido');
    await userEvent.type(screen.getByLabelText('O que aconteceu de fato'), 'O botão salvar não responde');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/relatos') && c.init?.method === 'POST')).toBe(true));
    const dados = chamadas.find((c) => c.url.endsWith('/relatos') && c.init?.method === 'POST')!.init!.body as FormData;
    expect(dados.get('categoria')).toBe('BUG');
    expect(dados.get('esperado')).toBe('Salvar o pedido');
  });

  it('permite remover um anexo antes de enviar e recusa formato inválido', async () => {
    mockFetch({ ...usuarioLogado('UNIDADE'), '/relatos': { status: 201, body: { id: 'r1' } } });
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    window.history.pushState(null, '', '/suporte/novo?de=%2F');
    render(<App />);
    const escolher = await screen.findByLabelText('Escolher arquivos');
    await userEvent.upload(escolher, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }), { applyAccept: false });
    await userEvent.upload(escolher, new File([new Uint8Array(10)], 'b.exe', { type: 'application/x-msdownload' }), { applyAccept: false });
    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.queryByText('b.exe')).not.toBeInTheDocument();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('b.exe'));
    await userEvent.click(screen.getByRole('button', { name: 'Remover a.png' }));
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
  });

  it('quem está sem acesso também abre o formulário, e o endereço antigo leva a ele', async () => {
    mockFetch({ ...usuarioLogado('SEM_ACESSO') });
    window.history.pushState(null, '', '/suporte/novo?de=%2F');
    const { unmount } = render(<App />);
    expect(await screen.findByLabelText('Título')).toBeInTheDocument();
    unmount();
    mockFetch({ ...usuarioLogado('UNIDADE') });
    window.history.pushState(null, '', '/reportar-bug');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/suporte/novo'));
  });
});

describe('Chamado de suporte — quem abriu', () => {
  it('"Meus chamados": lista com protocolo, categoria e status, e abre o chamado', async () => {
    mockFetch({
      ...usuarioLogado('UNIDADE'),
      '/relatos/meus': { body: [chamado(), chamado({ id: 'r2', numero: 8, titulo: 'Dúvida sobre o estoque', categoria: 'DUVIDA', status: 'AGUARDANDO_RETORNO' })] },
      '/relatos/r1/mensagens': { body: [] },
      '/relatos/r1': { body: chamado() },
    });
    window.history.pushState(null, '', '/suporte');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Meus chamados de suporte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Novo chamado' })).toHaveAttribute('href', '/suporte/novo?de=%2F');
    expect(screen.getByText('SUP-0007')).toBeInTheDocument();
    expect(screen.getByText('Dúvida')).toBeInTheDocument();
    expect(screen.getByText('Aguardando retorno')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Estoque em branco' }));
    expect(await screen.findByRole('heading', { name: /SUP-0007 · Estoque em branco/ })).toBeInTheDocument();
  });

  it('no chamado, quem abriu conversa com o atendimento e não vê ações de status nem o navegador', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('UNIDADE', { id: 'u2' }),
      '/relatos/r1/mensagens': (init) =>
        init?.method === 'POST'
          ? { status: 201, body: { id: 'm2', texto: 'Segue o print', criadoEm: '2026-11-12T17:00:00.000Z', autor: { id: 'u2', nome: 'Rodrigo Unidade', perfil: 'UNIDADE' } } }
          : { body: [{ id: 'm1', texto: 'Pode detalhar?', criadoEm: '2026-11-12T16:30:00.000Z', autor: { id: 'u9', nome: 'Carla Suporte', perfil: 'OPERADOR' } }] },
      '/relatos/r1': { body: chamado({ status: 'AGUARDANDO_RETORNO' }) },
    });
    window.history.pushState(null, '', '/suporte/r1');
    render(<App />);

    expect(await screen.findByText('Pode detalhar?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedir retorno' })).not.toBeInTheDocument();
    expect(screen.queryByText('Navegador')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Mensagem'), 'Segue o print');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(await screen.findByText('Segue o print')).toBeInTheDocument();
    const envio = chamadas.find((c) => c.url.endsWith('/relatos/r1/mensagens') && c.init?.method === 'POST')!;
    expect(JSON.parse(String(envio.init!.body))).toEqual({ texto: 'Segue o print' });
    // chamado de suporte não usa o controle de leitura dos pedidos
    expect(chamadas.some((c) => c.url.includes('/mensagens/lida'))).toBe(false);
  });

  it('resolvido: a conversa fecha e só o atendimento reabre', async () => {
    mockFetch({
      ...usuarioLogado('UNIDADE', { id: 'u2' }),
      '/relatos/r1/mensagens': { body: [] },
      '/relatos/r1': { body: chamado({ status: 'RESOLVIDO', resolvidoEm: '2026-11-13T10:00:00.000Z' }) },
    });
    window.history.pushState(null, '', '/suporte/r1');
    render(<App />);
    expect(await screen.findByText(/Chamado resolvido\. O atendimento pode reabri-lo/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
  });

  it('o item Suporte do menu do usuário abre a lista, de qualquer perfil', async () => {
    mockFetch({ ...usuarioLogado('TERCEIRIZADA', { prestadorId: 'p1' }), '/relatos/meus': { body: [] } });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Menu do usuário' }));
    await userEvent.click(screen.getByRole('link', { name: 'Suporte' }));
    expect(await screen.findByRole('heading', { name: 'Meus chamados de suporte' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/suporte');
  });
});

describe('Chamado de suporte — atendimento', () => {
  it('quem atende vê, no próprio Suporte, todos os chamados e um filtro para os que abriu; abre o detalhe', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR', { id: 'adm' }),
      '/relatos/r1/mensagens': { body: [] },
      '/relatos/r1': { body: chamado() },
      '/relatos': {
        body: [
          chamado(),
          chamado({ id: 'r3', numero: 9, titulo: 'Nova tela de metas', categoria: 'NOVA_FUNCIONALIDADE', status: 'EM_ANALISE' }),
          chamado({ id: 'r4', numero: 10, titulo: 'Meu próprio chamado', usuario: { id: 'adm', nome: 'Ana Teste', email: 'ana@joinville.sc.gov.br' } }),
        ],
      },
    });
    window.history.pushState(null, '', '/suporte');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Chamados de suporte' })).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.endsWith('/relatos'))).toBe(true);
    expect(chamadas.some((c) => c.url.endsWith('/relatos/meus'))).toBe(false);
    expect(screen.getByText('Nova funcionalidade')).toBeInTheDocument();
    expect(screen.getAllByText('Rodrigo Unidade')).toHaveLength(2);
    // filtro dos chamados que o próprio atendente abriu
    await userEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Abertos por mim' }));
    expect(screen.getByText('Meu próprio chamado')).toBeInTheDocument();
    expect(screen.queryByText('Nova tela de metas')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abertos por mim' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Todos' }));
    await userEvent.click(screen.getByRole('link', { name: 'Estoque em branco' }));
    expect(await screen.findByText('Unidade de Atendimento · rodrigo@joinville.sc.gov.br')).toBeInTheDocument();
    expect(screen.getByText('Navegador')).toBeInTheDocument();
    // voltar leva ao Suporte
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(window.location.pathname).toBe('/suporte');
  });

  it('pede retorno, resolve e reabre; cada passo muda o status no servidor', async () => {
    const respostas: Record<string, string> = {};
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR', { id: 'adm' }),
      '/relatos/r1/mensagens': { body: [] },
      '/relatos/r1/status': (init) => {
        const { status } = JSON.parse(String(init!.body));
        respostas.ultimo = status;
        return { body: chamado({ status, resolvidoEm: status === 'RESOLVIDO' ? '2026-11-13T10:00:00.000Z' : null }) };
      },
      '/relatos/r1': { body: chamado() },
    });
    window.history.pushState(null, '', '/suporte/r1');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Pedir retorno' }));
    await waitFor(() => expect(respostas.ultimo).toBe('AGUARDANDO_RETORNO'));
    await userEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    await waitFor(() => expect(respostas.ultimo).toBe('RESOLVIDO'));
    const reabrir = await screen.findByRole('button', { name: 'Reabrir' });
    expect(screen.getByText(/Chamado resolvido\. Reabra para voltar a conversar\./)).toBeInTheDocument();
    await userEvent.click(reabrir);
    await waitFor(() => expect(respostas.ultimo).toBe('EM_ANALISE'));
    expect(chamadas.filter((c) => c.url.endsWith('/relatos/r1/status') && c.init?.method === 'PATCH')).toHaveLength(3);
  });

  it('sem a permissão de atender, o Suporte mostra só os próprios chamados, mesmo para operador', async () => {
    const chamadas = mockFetch({
      ...usuarioLogado('OPERADOR', { permissoes: ['USUARIOS_ADMINISTRAR'] }),
      '/relatos/meus': { body: [chamado()] },
      '/relatos': { body: [] },
    });
    window.history.pushState(null, '', '/suporte');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Meus chamados de suporte' })).toBeInTheDocument();
    expect(chamadas.some((c) => c.url.endsWith('/relatos/meus'))).toBe(true);
    expect(chamadas.some((c) => c.url.endsWith('/relatos'))).toBe(false);
    // e Configurações não tem mais item de Suporte
    await userEvent.click(screen.getByRole('link', { name: 'Configurações' }));
    await screen.findByRole('link', { name: 'Usuários' });
    expect(screen.queryByRole('link', { name: 'Suporte' })).not.toBeInTheDocument();
  });

  it('os endereços antigos (bugs reportados e Configurações › Suporte) levam ao Suporte', async () => {
    mockFetch({ ...usuarioLogado('OPERADOR'), '/relatos': { body: [] } });
    window.history.pushState(null, '', '/configuracoes/relatos');
    const { unmount } = render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/suporte'));
    unmount();
    mockFetch({ ...usuarioLogado('OPERADOR'), '/relatos': { body: [] } });
    window.history.pushState(null, '', '/configuracoes/suporte');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/suporte'));
  });
});
