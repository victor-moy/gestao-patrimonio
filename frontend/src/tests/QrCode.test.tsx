import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

const gerarQr = vi.hoisted(() => vi.fn());
vi.mock('qrcode', () => ({ default: { toDataURL: gerarQr } }));

const equipamento = {
  id: 'e1',
  tombamento: '12345/2024',
  descricao: 'Autoclave Vertical 21L',
  estadoConservacao: 'BOM',
  status: 'ATIVO',
  emendaParlamentar: false,
  dataAquisicao: '2024-01-10T00:00:00.000Z',
  observacoes: null,
  tipoEquipamento: { id: 't1', codigo: 'AUT', nome: 'Autoclave Vertical', categoriaId: 'c1' },
  unidade: { id: 'u1', nome: 'UBS Centro' },
  movimentacoes: [],
  manutencoes: [],
};

describe('QR Code do equipamento', () => {
  afterEach(() => {
    localStorage.clear();
    gerarQr.mockReset();
  });

  function abrir() {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/inventario/e1');
    gerarQr.mockResolvedValue('data:image/png;base64,AAAA');
    mockFetch({
      '/equipamentos/e1': { body: equipamento },
      '/auth/me': {
        body: { id: '1', nome: 'Gestora', email: 'g@joinville.sc.gov.br', matricula: '1', perfil: 'GESTOR_PATRIMONIO', unidadeId: null, unidadeNome: null },
      },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);
  }

  it('o ícone ao lado do tombamento gera o QR do detalhe e abre a impressão, sem card na página', async () => {
    abrir();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    const botao = await screen.findByRole('button', { name: 'Imprimir etiqueta com QR Code' });
    expect(screen.queryByRole('heading', { name: 'QR Code' })).not.toBeInTheDocument();
    expect(gerarQr).not.toHaveBeenCalled();
    expect(imprimir).not.toHaveBeenCalled();

    await userEvent.click(botao);
    await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1));
    expect(gerarQr).toHaveBeenCalledWith(`${window.location.origin}/inventario/e1`, expect.objectContaining({ errorCorrectionLevel: 'M' }));

    // a etiqueta impressa leva QR, tombamento, descrição e unidade
    const etiqueta = document.querySelector('.qr-etiqueta-impressao') as HTMLElement;
    expect(etiqueta.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(etiqueta).toHaveTextContent('12345/2024');
    expect(etiqueta).toHaveTextContent('Autoclave Vertical 21L');
    expect(etiqueta).toHaveTextContent('UBS Centro');

    // novo clique reaproveita o QR já gerado
    await userEvent.click(botao);
    await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(2));
    expect(gerarQr).toHaveBeenCalledTimes(1);
  });

  it('avisa quando não consegue gerar o QR Code e não imprime', async () => {
    localStorage.setItem('sgp_token', 'token-teste');
    window.history.replaceState(null, '', '/inventario/e1');
    gerarQr.mockRejectedValue(new Error('falhou'));
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    mockFetch({
      '/equipamentos/e1': { body: equipamento },
      '/auth/me': {
        body: { id: '1', nome: 'Gestora', email: 'g@joinville.sc.gov.br', matricula: '1', perfil: 'GESTOR_PATRIMONIO', unidadeId: null, unidadeNome: null },
      },
      '/dashboard/alertas': { body: [] },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Imprimir etiqueta com QR Code' }));
    expect(await screen.findByText('Não foi possível gerar o QR Code.')).toBeInTheDocument();
    expect(imprimir).not.toHaveBeenCalled();
  });
});
