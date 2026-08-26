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
      expect(screen.getByRole('button', { name: /nova solicitação/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /nova solicitação/i }));

    // Catálogo de tipos (página dedicada, não mais um modal)
    await waitFor(() =>
      expect(screen.getByText('Selecione o tipo de solicitação')).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /ampliação/i }));

    // Formulário do tipo escolhido — Ampliação aceita múltiplos itens
    // numa lista repetível (feedback do cliente 17/08). O tipo é escolhido
    // via combobox com busca (SeletorTipoEquipamento), não um <select> nativo.
    await waitFor(() => expect(screen.getByText('Tipo de Equipamento *')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Selecione o tipo...'));
    await userEvent.type(screen.getByPlaceholderText('Buscar por nome ou código...'), 'Autoclave');
    await userEvent.click(screen.getByText('Autoclave Vertical 75L'));
    await userEvent.type(
      screen.getByRole('textbox'),
      'Ampliação da capacidade de esterilização',
    );
    await userEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(screen.getByText('Solicitação registrada.')).toBeInTheDocument();
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
      expect(screen.getByText('#12348/2023')).toBeInTheDocument();
      expect(screen.getAllByText('Pendente Aprovação').length).toBeGreaterThan(0);
    });
  });
});
