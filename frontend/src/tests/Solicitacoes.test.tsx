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
  it('unidade cria solicitação de novo item', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    const chamadas = mockFetch({
      ...me,
      '/solicitacoes': (init) =>
        init?.method === 'POST'
          ? {
              status: 201,
              body: { id: 'nova' },
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

    await waitFor(() => expect(screen.getByText('Tipo de Solicitação *')).toBeInTheDocument());
    const modal = within(screen.getByRole('dialog'));
    // selects do modal: [0] tipo de solicitação, [1] tipo de equipamento, [2] origem do recurso
    const selects = modal.getAllByRole('combobox');
    await userEvent.selectOptions(selects[1], '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6');
    await userEvent.type(
      modal.getByRole('textbox'),
      'Ampliação da capacidade de esterilização',
    );
    await userEvent.click(modal.getByRole('button', { name: /enviar solicitação/i }));

    await waitFor(() => {
      expect(screen.getByText('Solicitação registrada.')).toBeInTheDocument();
    });
    const post = chamadas.find(
      (c) => c.url.includes('/solicitacoes') && c.init?.method === 'POST',
    );
    expect(post).toBeDefined();
    const corpo = JSON.parse(String(post!.init!.body));
    expect(corpo.tipo).toBe('NOVO_ITEM');
    expect(corpo.quantidade).toBe(1);
    expect(corpo.origemRecurso).toBe('REGULAR');
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
            dataRetornoPrevista: null,
            automatica: false,
            criadoEm: '2026-05-02T10:00:00.000Z',
            valorVinculado: null,
            unidadeOrigem: { id: 'u1', nome: 'UBS Sul' },
            unidadeDestino: { id: 'u2', nome: 'UBS Centro' },
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
