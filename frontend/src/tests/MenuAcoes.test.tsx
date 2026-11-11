import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuAcoes } from '../components/MenuAcoes';

describe('Menu Ações', () => {
  it('sem nenhuma ação não aparece', () => {
    render(<MenuAcoes itens={[]} />);
    expect(screen.queryByRole('button', { name: 'Ações' })).not.toBeInTheDocument();
  });

  it('abre a lista, escolhe a ação e fecha; ação indisponível mostra o motivo e não executa', async () => {
    const aprovar = vi.fn();
    const bloqueada = vi.fn();
    render(
      <MenuAcoes
        itens={[
          { id: 'a', rotulo: 'Aprovar', aoEscolher: aprovar },
          { id: 'b', rotulo: 'Finalizar', aoEscolher: bloqueada, desabilitada: true, dica: 'Lance ao menos um item' },
        ]}
      />,
    );
    const botao = screen.getByRole('button', { name: 'Ações' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Lance ao menos um item')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /Finalizar/ }));
    expect(bloqueada).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Aprovar' }));
    expect(aprovar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Esc fecha e devolve o foco ao botão; clicar fora também fecha', async () => {
    render(<MenuAcoes itens={[{ id: 'a', rotulo: 'Aprovar', aoEscolher: () => undefined }]} />);
    const botao = screen.getByRole('button', { name: 'Ações' });
    await userEvent.click(botao);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Aprovar' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
    await userEvent.click(botao);
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
