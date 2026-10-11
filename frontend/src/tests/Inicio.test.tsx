import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const usuarioGestor = {
  id: '1',
  nome: 'Gestor Teste',
  email: 'gestor@example.com',
  perfil: 'GESTOR_PATRIMONIO',
  unidadeId: null,
};

it('exibe boas-vindas, alertas importantes e o estado futuro de mensagens', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  const chamadas = mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/dashboard/alertas': {
      body: [
        {
          tipo: 'ATA_VENCIDA',
          severidade: 'CRITICO',
          mensagem: 'Ata 123 está vencida',
        },
      ],
    },
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Bem-vindo, Gestor' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Alertas importantes' })).toBeInTheDocument();
  expect(await screen.findByText('Ata 123 está vencida')).toBeInTheDocument();
  expect(screen.getByText('Crítico')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Mensagens não lidas' })).toBeInTheDocument();
  expect(screen.getByText('Nenhuma mensagem não lida')).toBeInTheDocument();
  expect(screen.getByText('Novas mensagens aparecerão aqui.')).toBeInTheDocument();
  expect(screen.queryByText('Em breve')).not.toBeInTheDocument();
  expect(screen.queryByText('Resumo da operação')).not.toBeInTheDocument();
  expect(screen.queryByText('Ações rápidas')).not.toBeInTheDocument();
  expect(chamadas.some((chamada) => chamada.url.includes('/dashboard/resumo'))).toBe(false);
});

it('permite tentar novamente quando os alertas falham', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  let falhar = true;
  mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/dashboard/alertas': () =>
      falhar
        ? { status: 500, body: { mensagem: 'Falha temporária' } }
        : { body: [] },
  });

  render(<App />);

  expect(await screen.findByText('Não foi possível carregar os alertas.')).toBeInTheDocument();
  falhar = false;
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhum alerta importante')).toBeInTheDocument();
});
