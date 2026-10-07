import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

it('exibe os três totais retornados pela consulta de resumo', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  mockFetch({
    '/auth/me': { body: { id: '1', nome: 'Gestor Teste', email: 'gestor@example.com', perfil: 'GESTOR_PATRIMONIO', unidadeId: null } },
    '/dashboard/resumo': { body: { totalEquipamentos: 21, unidadesAtendidas: 6, totalSolicitacoes: 81 } },
    '/dashboard/alertas': { body: [] },
  });
  render(<App />);
  expect(await screen.findByText('21')).toBeInTheDocument();
  expect(await screen.findByText('6')).toBeInTheDocument();
  expect(await screen.findByText('81')).toBeInTheDocument();
});
