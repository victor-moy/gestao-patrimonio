import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const usuarioGestor = {
  id: '1',
  nome: 'Gestor Teste',
  email: 'gestor@example.com',
  perfil: 'OPERADOR',
  unidadeId: null,
};

it('exibe boas-vindas, alertas importantes e o estado futuro de mensagens', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  const chamadas = mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { body: [] },
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
    '/conversas': { body: [] },
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

it('lista as conversas com mensagens não lidas, com o total e links para abrir', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': {
      body: [
        { contexto: 'solicitacao', id: 's1', numero: 12, tipoSolicitacao: 'AMPLIACAO', item: 'Autoclave', unidade: 'UBS Norte', ultimaEm: '2026-10-10T10:05:00Z', ultimoTexto: 'Podem enviar o orçamento?', ultimoAutor: 'Ana Unidade', naoLidas: 2 },
        { contexto: 'manutencao', id: 'm1', numero: 3, tipoSolicitacao: null, item: 'Microscópio', unidade: 'UBS Norte', ultimaEm: '2026-10-09T10:05:00Z', ultimoTexto: 'Ok', ultimoAutor: 'Carla', naoLidas: 0 },
      ],
    },
    '/dashboard/alertas': { body: [] },
  });

  render(<App />);

  expect(await screen.findByLabelText('2 mensagens não lidas', { selector: '.inicio-contagem' })).toBeInTheDocument();
  const link = await screen.findByRole('link', { name: /SOL-0012/ });
  expect(link).toHaveAttribute('href', '/conversas/solicitacao/s1');
  expect(link).toHaveTextContent('Ana Unidade: Podem enviar o orçamento?');
  // só aparece quem tem mensagem não lida
  expect(screen.queryByRole('link', { name: /MAN-0003/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ver todas as conversas' })).not.toBeInTheDocument();
});

it('mostra erro com nova tentativa quando as conversas não carregam, sem fingir que não há mensagens', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { status: 500, body: { mensagem: 'Falha' } },
    '/dashboard/alertas': { body: [] },
  });
  render(<App />);
  expect(await screen.findByText('Não foi possível carregar as mensagens')).toBeInTheDocument();
  expect(screen.queryByText('Nenhuma mensagem não lida')).not.toBeInTheDocument();
});
