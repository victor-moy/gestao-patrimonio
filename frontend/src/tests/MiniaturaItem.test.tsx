import { fireEvent, render } from '@testing-library/react';
import { MiniaturaItem } from '../components/MiniaturaItem';

describe('MiniaturaItem', () => {
  it('mostra a foto do tipo quando existe', () => {
    const { container } = render(<MiniaturaItem imagemUrl="/uploads/tipos/autoclave.png" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/uploads/tipos/autoclave.png');
  });

  it('sem foto mostra só o quadrado cinza, sem imagem nem ícone', () => {
    const { container } = render(<MiniaturaItem imagemUrl={null} />);
    expect(container.querySelector('.miniatura-item')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('se a foto não carregar, cai no quadrado cinza', () => {
    const { container } = render(<MiniaturaItem imagemUrl="/uploads/tipos/apagada.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.miniatura-item')).not.toBeNull();
  });

  it('é decorativa: o nome do item já está ao lado', () => {
    const { container } = render(<MiniaturaItem imagemUrl="/uploads/tipos/x.png" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
