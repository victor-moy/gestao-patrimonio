import { useEffect, useRef, useState } from 'react';
import { IconeBusca, IconeCheck, IconeChevron } from './icons';

export interface Visualizacao {
  valor: string;
  rotulo: string;
}

interface BarraConsultaProps {
  pesquisa: string; // aria-label da região de busca
  menu: string; // aria-label do menu de visualizações
  campoBusca: string; // aria-label do campo de busca
  visualizacoes?: Visualizacao[];
  filtro: string;
  onFiltro: (valor: string) => void;
  busca: string;
  onBusca: (valor: string) => void;
}

// Barra padrão das listas: menu de visualizações (opcional) + busca. O menu fecha
// com Escape ou clique fora, como no Inventário.
export function BarraConsulta({
  pesquisa,
  menu,
  campoBusca,
  visualizacoes,
  filtro,
  onFiltro,
  busca,
  onBusca,
}: BarraConsultaProps) {
  const [menuAberto, setMenuAberto] = useState(false);
  const controles = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fechar(evento: PointerEvent | KeyboardEvent) {
      if (evento instanceof KeyboardEvent) {
        if (evento.key !== 'Escape') return;
      } else if (controles.current?.contains(evento.target as Node)) {
        return;
      }
      setMenuAberto(false);
    }
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', fechar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', fechar);
    };
  }, []);

  const atual = visualizacoes?.find((v) => v.valor === filtro);

  return (
    <div className="inventario-controles" ref={controles}>
      <div className="inventario-indexbar">
        <div className="inventario-consulta" role="search" aria-label={pesquisa}>
          {visualizacoes && (
            <div className="inventario-visualizacao">
              <button
                type="button"
                className="inventario-visualizacao-botao"
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                onClick={() => setMenuAberto((aberto) => !aberto)}
              >
                <span className="inventario-visualizacao-rotulo">{atual?.rotulo ?? visualizacoes[0]?.rotulo}</span>
                <IconeChevron />
              </button>
              {menuAberto && (
                <div className="inventario-visualizacao-menu" role="menu" aria-label={menu}>
                  {visualizacoes.map(({ valor, rotulo }) => (
                    <button
                      key={valor}
                      type="button"
                      role="menuitemradio"
                      aria-checked={filtro === valor}
                      onClick={() => {
                        onFiltro(valor);
                        setMenuAberto(false);
                      }}
                    >
                      <span className="inventario-visualizacao-check" aria-hidden>
                        {filtro === valor && <IconeCheck />}
                      </span>
                      <span>{rotulo}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="inventario-consulta-busca">
            <IconeBusca />
            <input
              aria-label={campoBusca}
              placeholder="Buscar e filtrar"
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
