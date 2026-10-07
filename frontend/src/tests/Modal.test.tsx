import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { useState } from 'react';
import { Modal } from '../components/Modal';

function Exemplo() {
  const [aberto, setAberto] = useState(false);
  return <><button onClick={() => setAberto(true)}>Abrir</button>{aberto && <Modal titulo="Detalhes" onFechar={() => setAberto(false)}><button>Última ação</button></Modal>}</>;
}
it('mantém o foco no modal e retorna ao acionador ao fechar com Escape', async () => {
  render(<Exemplo />);
  await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'Última ação' })).toHaveFocus();
  await userEvent.tab();
  expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus();
  expect(document.body.style.overflow).not.toBe('hidden');
});
