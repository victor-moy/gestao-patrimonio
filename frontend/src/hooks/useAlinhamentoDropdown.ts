import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

// Decide se o painel de um dropdown deve abrir alinhado à esquerda (padrão)
// ou à direita do gatilho — sem isso, um painel largo (ex.: 420px) num campo
// posicionado perto da borda direita da tela estoura a viewport e "estica"
// o scroll horizontal da página inteira.
export function useAlinhamentoDropdown(
  containerRef: RefObject<HTMLElement | null>,
  aberto: boolean,
  larguraMinima = 420,
): 'esquerda' | 'direita' {
  const [alinhamento, setAlinhamento] = useState<'esquerda' | 'direita'>('esquerda');

  useLayoutEffect(() => {
    if (!aberto || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const largura = Math.max(rect.width, larguraMinima);
    setAlinhamento(rect.left + largura > window.innerWidth ? 'direita' : 'esquerda');
  }, [aberto, containerRef, larguraMinima]);

  return alinhamento;
}
