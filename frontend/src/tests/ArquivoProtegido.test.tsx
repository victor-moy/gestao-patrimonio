import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImagemProtegida, LinkArquivoProtegido } from '../components/ArquivoProtegido';
import { baixarArquivoProtegido } from '../api/client';

vi.mock('../api/client', () => ({ baixarArquivoProtegido: vi.fn() }));

describe('ArquivoProtegido', () => {
  const revogar = vi.fn();
  beforeEach(() => {
    // jsdom não implementa revokeObjectURL
    URL.revokeObjectURL = revogar;
    revogar.mockClear();
  });

  afterEach(() => {
    vi.mocked(baixarArquivoProtegido).mockReset();
    vi.restoreAllMocks();
  });

  it('link abre o arquivo autenticado em outra aba sem expor o opener', async () => {
    vi.mocked(baixarArquivoProtegido).mockResolvedValue('blob:laudo');
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<LinkArquivoProtegido caminho="/uploads/laudos/a.pdf">Ver laudo</LinkArquivoProtegido>);

    await userEvent.click(screen.getByRole('button', { name: 'Ver laudo' }));

    await waitFor(() => expect(abrir).toHaveBeenCalledWith('blob:laudo', '_blank', 'noopener'));
    expect(baixarArquivoProtegido).toHaveBeenCalledWith('/uploads/laudos/a.pdf');
    expect(screen.getByRole('button', { name: 'Ver laudo' })).toBeEnabled();
  });

  it('link informa a falha ao abrir o arquivo', async () => {
    vi.mocked(baixarArquivoProtegido).mockRejectedValue(new Error('Sem permissão'));
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<LinkArquivoProtegido caminho="/uploads/laudos/a.pdf">Ver laudo</LinkArquivoProtegido>);

    await userEvent.click(screen.getByRole('button', { name: 'Ver laudo' }));

    await waitFor(() => expect(alerta).toHaveBeenCalledWith('Sem permissão'));
  });

  it('imagem mostra o carregamento e depois a figura', async () => {
    vi.mocked(baixarArquivoProtegido).mockResolvedValue('blob:foto');
    render(<ImagemProtegida caminho="/uploads/solicitacoes/f.png" alt="Foto do equipamento" />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando imagem…');
    expect(await screen.findByRole('img', { name: 'Foto do equipamento' })).toHaveAttribute('src', 'blob:foto');
  });

  it('imagem avisa quando não consegue carregar', async () => {
    vi.mocked(baixarArquivoProtegido).mockRejectedValue(new Error('falha'));
    render(<ImagemProtegida caminho="/uploads/solicitacoes/f.png" alt="Foto" />);

    expect(await screen.findByText('Não foi possível carregar a imagem.')).toBeInTheDocument();
  });

  it('imagem libera a URL temporária ao sair da tela', async () => {
    vi.mocked(baixarArquivoProtegido).mockResolvedValue('blob:foto');
    const { unmount } = render(<ImagemProtegida caminho="/x.png" alt="Foto" />);
    await screen.findByRole('img');

    unmount();

    expect(revogar).toHaveBeenCalledWith('blob:foto');
  });
});
