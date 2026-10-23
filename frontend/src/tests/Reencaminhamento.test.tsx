import { render, screen, waitFor } from '@testing-library/react';
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
    '/manutencoes/m1/historico': { body: [] },
    '/contratos': { body: [] },
  };
}

const civil = (extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  numero: 12,
  tipo: 'CIVIL',
  titulo: 'Ar-condicionado não liga',
  status: 'EM_EXECUCAO',
  descricaoProblema: 'O ar-condicionado do consultório não liga',
  localAfetado: 'Consultório 2',
  categoriaCivil: 'ELETRICA',
  fotos: [],
  motivoNegacao: null,
  orcamentoValor: null,
  laudoBaixa: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  custoFinal: null,
  criadoEm: '2026-10-01T13:00:00.000Z',
  dataConclusao: null,
  equipamento: null,
  unidade: { id: 'u1', nome: 'UBS Centro' },
  solicitante: { nome: 'Rodrigo' },
  contrato: { id: 'c1', numero: 'CONT-1', prestador: { nome: 'Predial Ltda' } },
  linhasRelatorio: [],
  ...extra,
});

const etapa = (extra: Record<string, unknown>) => ({
  tipo: 'CIVIL',
  titulo: 'Ar-condicionado não liga',
  criadoEm: '2026-10-01T13:00:00.000Z',
  dataConclusao: null,
  motivoReencaminhamento: null,
  reencaminhadoDeId: null,
  atual: false,
  acessivel: true,
  prestador: null,
  baixa: null,
  ...extra,
});

const semTrajetoria = { '/manutencoes/m1/trajetoria': { body: [] } };
const MOTIVO = 'A instalação elétrica está normal; o defeito é no equipamento.';

afterEach(() => localStorage.clear());

describe('Reencaminhamento de chamados', () => {
  it('a terceirizada pede o reencaminhamento só com o motivo em texto', async () => {
    const chamadas = mockFetch({
      ...entrarComo('TERCEIRIZADA', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1/solicitar-reencaminhamento': { body: {} },
      '/manutencoes/m1': { body: civil() },
    });
    render(<App />);

    const confirmar = await screen.findByRole('button', { name: 'Reencaminhar' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motivo do reencaminhamento *'), 'curto');
    expect(confirmar).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Motivo do reencaminhamento *'));
    await userEvent.type(screen.getByLabelText('Motivo do reencaminhamento *'), MOTIVO);
    expect(confirmar).toBeEnabled();

    await userEvent.click(confirmar);
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/solicitar-reencaminhamento'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/solicitar-reencaminhamento'))!.init!.body as string)).toEqual({ motivo: MOTIVO });
  });

  it('o Administrador não vê Reencaminhar antes do pedido; depois do pedido só confirma', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1': { body: civil() },
    });
    render(<App />);

    expect(await screen.findByRole('link', { name: 'Conversar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reencaminhar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar reencaminhamento' })).not.toBeInTheDocument();
  });

  it('a unidade não vê o botão de pedir nem as ações do Administrador', async () => {
    mockFetch({
      ...entrarComo('UNIDADE', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1': { body: civil({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO }) },
    });
    render(<App />);

    expect(await screen.findByText(MOTIVO)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reencaminhar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar reencaminhamento' })).not.toBeInTheDocument();
  });

  it('o Administrador lê o motivo e confirma o reencaminhamento', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1/confirmar-reencaminhamento': { body: {} },
      '/manutencoes/m1': { body: civil({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO }) },
    });
    render(<App />);

    expect(await screen.findByText(MOTIVO)).toBeInTheDocument();
    expect(screen.queryByLabelText('O que fazer *')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar reencaminhamento' }));
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/manutencoes/m1/confirmar-reencaminhamento'))).toBe(true));
  });

  it('confirmado, o Administrador abre um novo chamado de equipamento escolhendo o equipamento', async () => {
    const chamadas = mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1/reencaminhar/manutencao': { body: { id: 'm2' } },
      '/equipamentos': {
        body: [{ id: 'eq1', tombamento: '123/2024', descricao: 'Split 12000 BTU', tipoEquipamento: { nome: 'Ar-condicionado' } }],
      },
      '/manutencoes/m1': {
        body: civil({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO, reencaminhamentoConfirmadoEm: '2026-10-02T10:00:00.000Z' }),
      },
    });
    render(<App />);

    expect(await screen.findByRole('option', { name: 'Baixar o equipamento (Patrimônio)' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Tipo do novo chamado'), 'EQUIPAMENTO');
    const abrir = screen.getByRole('button', { name: 'Abrir novo chamado' });
    expect(abrir).toBeDisabled();
    await userEvent.selectOptions(await screen.findByLabelText('Equipamento *'), 'eq1');
    await userEvent.click(abrir);

    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/reencaminhar/manutencao'))).toBe(true));
    expect(JSON.parse(chamadas.find((c) => c.url.endsWith('/reencaminhar/manutencao'))!.init!.body as string)).toEqual({
      tipo: 'EQUIPAMENTO',
      equipamentoId: 'eq1',
    });
    expect(chamadas.find((c) => c.url.includes('/equipamentos'))!.url).toContain('unidadeId=u1');
  });

  it('chamado de equipamento: a baixa exige o laudo em PDF', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      ...semTrajetoria,
      '/manutencoes/m1': {
        body: civil({
          tipo: 'EQUIPAMENTO',
          localAfetado: null,
          categoriaCivil: null,
          equipamento: { id: 'eq1', tombamento: '123/2024', descricao: 'Split', tipoEquipamento: { nome: 'Ar-condicionado' } },
          status: 'REENCAMINHAMENTO_SOLICITADO',
          motivoReencaminhamento: MOTIVO,
          reencaminhamentoConfirmadoEm: '2026-10-02T10:00:00.000Z',
        }),
      },
    });
    render(<App />);

    await userEvent.selectOptions(await screen.findByLabelText('O que fazer *'), 'baixa');
    expect(screen.getByRole('button', { name: 'Confirmar baixa' })).toBeDisabled();
    expect(screen.getByText('Laudo de baixa (PDF) *')).toBeInTheDocument();
  });

  it('a trajetória mostra a cadeia, abre só o que é acessível e não aparece em chamado sem reencaminhamento', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m2'),
      '/manutencoes/m2/historico': { body: [] },
      '/manutencoes/m2/trajetoria': {
        body: [
          etapa({ id: 'm1', numero: 12, status: 'CONCLUIDA', motivoReencaminhamento: MOTIVO, prestador: 'Predial Ltda' }),
          etapa({ id: 'm2', numero: 13, status: 'PENDENTE_APROVACAO', reencaminhadoDeId: 'm1', atual: true }),
          etapa({ id: 'm3', numero: 14, status: 'EM_EXECUCAO', acessivel: false }),
        ],
      },
      '/manutencoes/m2': { body: civil({ id: 'm2', numero: 13, status: 'PENDENTE_APROVACAO', contrato: null }) },
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Trajetória do caso' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MAN-0012' })).toHaveAttribute('href', '/manutencoes/m1');
    // A etapa atual e a sem acesso não viram link
    expect(screen.queryByRole('link', { name: 'MAN-0013' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'MAN-0014' })).not.toBeInTheDocument();
    expect(screen.getByText(`Motivo do reencaminhamento: ${MOTIVO}`)).toBeInTheDocument();
  });

  it('chamado de uma etapa só não mostra trajetória; falha ao carregar mostra erro com nova tentativa', async () => {
    mockFetch({
      ...entrarComo('OPERADOR', '/manutencoes/m1'),
      '/manutencoes/m1/trajetoria': { status: 500, body: { mensagem: 'erro' } },
      '/manutencoes/m1': { body: civil({ status: 'PENDENTE_APROVACAO', contrato: null }) },
      '/manutencoes/m1/similares': { body: [] },
    });
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a trajetória.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
