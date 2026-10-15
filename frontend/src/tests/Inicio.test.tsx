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

it('exibe boas-vindas, pendências, atualizações e mensagens', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  const chamadas = mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { body: [] },
    '/avisos': { body: { itens: [], total: 0 } },
    '/dashboard/alertas': {
      body: [
        {
          tipo: 'ATA_VENCIDA',
          severidade: 'CRITICO',
          mensagem: 'Ata 123 está vencida',
          contagem: 1,
          href: '/atas',
        },
        {
          tipo: 'ATA_VENCIMENTO',
          severidade: 'AVISO',
          mensagem: 'Ata 45 vence em 5 dias',
          contagem: 1,
          href: '/atas',
        },
        {
          tipo: 'FILA_RETORNO_MANUT',
          severidade: 'AVISO',
          mensagem: '2 retornos de manutenção aguardando sua confirmação',
          contagem: 2,
          href: '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_RETORNO',
        },
      ],
    },
  });

  render(<App />);

  expect(await screen.findByRole('heading', { name: 'Bem-vindo, Gestor' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Resumo da caixa de entrada')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Pendências' })).toBeInTheDocument();
  const pendencia = await screen.findByRole('link', { name: /Ata 123 está vencida/ });
  expect(pendencia).toHaveAttribute('href', '/atas');
  expect(pendencia).toHaveAccessibleName(/Crítico/);
  expect(screen.getByRole('link', { name: /Ata 45 vence/ })).toBeInTheDocument();
  const retorno = screen.getByRole('link', { name: /retornos de manutenção/ });
  expect(retorno).toHaveAttribute('href', '/solicitacoes?tipo=MANUTENCAO&status=AGUARDANDO_RETORNO');
  expect(screen.getByLabelText('2 itens')).toBeInTheDocument();
  expect(screen.getByLabelText('4 pendências em 3 grupos')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Atualizações' })).toBeInTheDocument();
  expect(screen.getByText('Nenhuma atualização nova')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Mensagens não lidas' })).toBeInTheDocument();
  expect(screen.getByText('Nenhuma mensagem não lida')).toBeInTheDocument();
  expect(screen.queryByText('Em breve')).not.toBeInTheDocument();
  expect(screen.queryByText('Ações rápidas')).not.toBeInTheDocument();
  expect(chamadas.some((chamada) => chamada.url.includes('/dashboard/resumo'))).toBe(false);
});

it('permite tentar novamente quando as pendências falham', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  let falhar = true;
  mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { body: [] },
    '/avisos': { body: { itens: [], total: 0 } },
    '/dashboard/alertas': () =>
      falhar
        ? { status: 500, body: { mensagem: 'Falha temporária' } }
        : { body: [] },
  });

  render(<App />);

  expect(await screen.findByText('Não foi possível carregar as pendências.')).toBeInTheDocument();
  falhar = false;
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nada pendente com você agora')).toBeInTheDocument();
});

it('marca atualização sem link como lida pelo botão', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  const chamadas = mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { body: [] },
    '/dashboard/alertas': { body: [] },
    '/avisos': {
      body: {
        total: 1,
        itens: [
          {
            id: 'av-2',
            tipo: 'SOLICITACAO_EXPIRADA',
            titulo: 'Pedido expirado',
            mensagem: 'SOL-0009 expirou por falta de ação.',
            href: null,
            solicitacaoId: 's9',
            manutencaoId: null,
            lidaEm: null,
            criadoEm: 'data-invalida',
          },
        ],
      },
    },
    '/avisos/av-2/ler': { body: { id: 'av-2', lidaEm: '2026-10-15T12:05:00.000Z' } },
  });

  render(<App />);

  const botao = await screen.findByRole('button', { name: /Pedido expirado/ });
  await userEvent.click(botao);
  expect(chamadas.some((c) => c.url.includes('/avisos/av-2/ler') && c.init?.method === 'POST')).toBe(true);
  expect(await screen.findByText('Nenhuma atualização nova')).toBeInTheDocument();
});

it('lista atualizações não lidas e marca como lida ao abrir', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  const chamadas = mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { body: [] },
    '/dashboard/alertas': { body: [] },
    '/avisos': {
      body: {
        total: 7,
        itens: [
          {
            id: 'av-1',
            tipo: 'SOLICITACAO_APROVADA',
            titulo: 'Solicitação aprovada',
            mensagem: 'SOL-0012 foi aprovada pelo Patrimônio.',
            href: '/solicitacoes/s1',
            solicitacaoId: 's1',
            manutencaoId: null,
            lidaEm: null,
            criadoEm: '2026-10-15T12:00:00.000Z',
          },
        ],
      },
    },
    '/avisos/av-1/ler': { body: { id: 'av-1', lidaEm: '2026-10-15T12:05:00.000Z' } },
  });

  render(<App />);

  expect(await screen.findByLabelText('7 atualizações não lidas')).toBeInTheDocument();
  const link = await screen.findByRole('link', { name: /Solicitação aprovada/ });
  expect(link).toHaveAttribute('href', '/solicitacoes/s1');
  await userEvent.click(link);
  expect(chamadas.some((c) => c.url.includes('/avisos/av-1/ler') && c.init?.method === 'POST')).toBe(true);
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
    '/avisos': { body: { itens: [], total: 0 } },
  });

  render(<App />);

  expect(await screen.findByLabelText('2 mensagens não lidas', { selector: '.inicio-contagem' })).toBeInTheDocument();
  const link = await screen.findByRole('link', { name: /SOL-0012/ });
  expect(link).toHaveAttribute('href', '/conversas/solicitacao/s1');
  expect(link).toHaveTextContent('Ana Unidade: Podem enviar o orçamento?');
  expect(screen.queryByRole('link', { name: /MAN-0003/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ver todas as conversas' })).not.toBeInTheDocument();
});

it('mostra erro com nova tentativa quando as conversas não carregam, sem fingir que não há mensagens', async () => {
  localStorage.setItem('sgp_token', 'token-teste');
  mockFetch({
    '/auth/me': { body: usuarioGestor },
    '/conversas': { status: 500, body: { mensagem: 'Falha' } },
    '/dashboard/alertas': { body: [] },
    '/avisos': { body: { itens: [], total: 0 } },
  });
  render(<App />);
  expect(await screen.findByText('Não foi possível carregar as mensagens')).toBeInTheDocument();
  expect(screen.queryByText('Nenhuma mensagem não lida')).not.toBeInTheDocument();
});
