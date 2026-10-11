import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { BarraCarregamento } from '../components/BarraCarregamento';

describe('Barra de carregamento global', () => {
  it('aparece enquanto há requisição em andamento e some depois de concluída', async () => {
    let concluir: (r: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (concluir = resolve))));
    render(<BarraCarregamento />);
    const barra = screen.getByRole('progressbar', { hidden: true });
    expect(barra).not.toHaveClass('ativa');

    const pedido = api.get('/qualquer-coisa').catch(() => undefined);
    await waitFor(() => expect(barra).toHaveClass('ativa'), { timeout: 1500 });

    concluir({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    } as Response);
    await pedido;
    await waitFor(() => expect(barra).not.toHaveClass('ativa'), { timeout: 2000 });
  });

  it('não pisca em respostas instantâneas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({}) }) as Response),
    );
    render(<BarraCarregamento />);
    const barra = screen.getByRole('progressbar', { hidden: true });
    await api.get('/rapido');
    await new Promise((r) => setTimeout(r, 250));
    expect(barra).not.toHaveClass('ativa');
  });
});
