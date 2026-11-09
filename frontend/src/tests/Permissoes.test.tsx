import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function operador(permissoes: string[]) {
  return {
    '/auth/me': {
      body: {
        id: '1',
        nome: 'Operadora Teste',
        email: 'op@joinville.sc.gov.br',
        matricula: '10001',
        perfil: 'OPERADOR',
        unidadeId: null,
        unidadeNome: null,
        permissoes,
      },
    },
    '/dashboard/alertas': { body: [] },
  };
}

function abrir(rota: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', rota);
  return render(<App />);
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('Menu e rotas conforme as permissões do operador', () => {
  it('mostra no menu só as áreas liberadas', async () => {
    mockFetch({ ...operador(['ATAS_GERENCIAR', 'RELATORIOS_VISUALIZAR']) });
    abrir('/');
    expect(await screen.findByRole('link', { name: 'Atas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relatórios' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contratos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Estoque' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configurações' })).not.toBeInTheDocument();
  });

  it('o link de Configurações aparece com qualquer permissão de cadastro', async () => {
    mockFetch({ ...operador(['CONTRATOS_GERENCIAR']) });
    abrir('/');
    expect(await screen.findByRole('link', { name: 'Configurações' })).toBeInTheDocument();
  });

  it('endereço de uma área sem permissão volta ao início', async () => {
    mockFetch({ ...operador(['ATAS_GERENCIAR']), '/contratos': { body: [] } });
    abrir('/contratos');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('sem nenhuma permissão, só a tela inicial', async () => {
    mockFetch({ ...operador([]) });
    abrir('/atas');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('link', { name: 'Atas' })).not.toBeInTheDocument();
  });
});

describe('Cadastro de usuário: permissões do operador', () => {
  const base = {
    ...operador(['USUARIOS_ADMINISTRAR']),
    '/usuarios': { body: [] },
    '/unidades': { body: [] },
    '/prestadores': { body: [] },
  };

  it('a seção de permissões só aparece para o perfil Operador', async () => {
    mockFetch(base);
    abrir('/configuracoes/usuarios/novo');
    const perfil = await screen.findByLabelText('Perfil de acesso');
    await waitFor(() => expect(perfil).toBeEnabled());
    expect(screen.queryByText('Permissões do operador')).not.toBeInTheDocument();
    await userEvent.selectOptions(perfil, 'GALPAO');
    expect(screen.queryByText('Permissões do operador')).not.toBeInTheDocument();
    await userEvent.selectOptions(perfil, 'OPERADOR');
    expect(screen.getByText('Permissões do operador')).toBeInTheDocument();
    const manutencoes = screen.getByRole('group', { name: 'Solicitações - Manutenções' });
    for (const rotulo of [
      'Consultar chamados',
      'Escrever chamados',
      'Triar chamados',
      'Realizar avaliação técnica',
      'Registrar vistorias',
      'Preparar medições',
      'Conferir medições',
      'Fiscalizar',
    ]) {
      expect(within(manutencoes).getByRole('checkbox', { name: rotulo })).not.toBeChecked();
    }
    expect(screen.getByRole('checkbox', { name: 'Gerenciar contratos' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Gerenciar atas' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Gerenciar estoque' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Visualizar relatórios' })).toBeInTheDocument();
  });

  it('envia as permissões marcadas ao cadastrar', async () => {
    const chamadas = mockFetch({ ...base, '/usuarios': (init) => (init?.method === 'POST' ? { status: 201, body: { id: 'novo' } } : { body: [] }) });
    abrir('/configuracoes/usuarios/novo');
    const email = await screen.findByLabelText('E-mail');
    await waitFor(() => expect(email).toBeEnabled());
    await userEvent.type(email, 'nova@joinville.sc.gov.br');
    await userEvent.selectOptions(screen.getByLabelText('Perfil de acesso'), 'OPERADOR');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Triar chamados' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gerenciar atas' }));
    expect(screen.getByText('2 permissões selecionadas')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Salvar|Cadastrar|Criar/ }));
    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'POST' && c.url.includes('/usuarios'))).toBe(true));
    const envio = chamadas.find((c) => c.init?.method === 'POST' && c.url.includes('/usuarios'))!;
    expect(JSON.parse(String(envio.init?.body))).toMatchObject({
      perfil: 'OPERADOR',
      permissoes: ['MANUTENCAO_TRIAR', 'ATAS_GERENCIAR'],
    });
  });

  it('na edição carrega as permissões do operador e não as envia para outros perfis', async () => {
    const op = { id: 'u9', nome: 'Op Nove', email: 'nove@j.sc.gov.br', matricula: '9', perfil: 'OPERADOR', unidadeId: null, ativo: true, permissoes: ['ESTOQUE_GERENCIAR'] };
    const gal = { id: 'u8', nome: 'Gal Oito', email: 'oito@j.sc.gov.br', matricula: '8', perfil: 'GALPAO', unidadeId: 'un1', ativo: true, permissoes: [] };
    mockFetch({ ...base, '/usuarios': { body: [op, gal] }, '/unidades': { body: [{ id: 'un1', nome: 'UBS', tipo: 'UBSF', ativo: true }] } });
    abrir('/configuracoes/usuarios/u9');
    const caixa = await screen.findByRole('checkbox', { name: 'Gerenciar estoque' });
    expect(caixa).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Gerenciar atas' })).not.toBeChecked();
  });
});

describe('Detalhe da manutenção conforme as permissões do operador', () => {
  const chamado = {
    id: 'm1',
    numero: 7,
    tipo: 'EQUIPAMENTO',
    status: 'PENDENTE_APROVACAO',
    descricaoProblema: 'Não atinge a temperatura adequada',
    criadoEm: '2026-10-01T13:00:00.000Z',
    confirmadoUnidade: false,
    confirmadoGestor: false,
    equipamento: { id: 'e1', tombamento: '12345/2024', descricao: 'Autoclave', tipoEquipamento: { nome: 'Autoclave Vertical' } },
    unidade: { id: 'u1', nome: 'UBS Centro' },
    solicitante: { nome: 'Rodrigo' },
    contrato: null,
  };
  const rotas = (permissoes: string[]) => ({
    ...operador(permissoes),
    '/manutencoes/m1/historico': { body: [] },
    '/manutencoes/m1/trajetoria': { body: [] },
    '/manutencoes/m1': { body: chamado },
    '/contratos': { body: [] },
  });

  it('quem só consulta vê o chamado, mas sem aprovar nem negar', async () => {
    mockFetch(rotas(['MANUTENCAO_CONSULTAR']));
    abrir('/manutencoes/m1');
    expect(await screen.findByText('Não atinge a temperatura adequada')).toBeInTheDocument();
    // sem nenhuma ação disponível o menu nem aparece
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('quem tria vê aprovar e negar', async () => {
    mockFetch(rotas(['MANUTENCAO_CONSULTAR', 'MANUTENCAO_TRIAR']));
    abrir('/manutencoes/m1');
    await userEvent.click(await screen.findByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: 'Aprovar chamado' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Negar chamado' })).toBeInTheDocument();
  });
});
