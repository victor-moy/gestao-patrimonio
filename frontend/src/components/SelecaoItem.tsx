import { useRef, useState } from 'react';
import type { ItemSinapi } from '../types';

export const rotuloSinapi = (i: ItemSinapi) => `${i.codigo} · ${i.descricao}`;

// Busca e seleção do item da tabela SINAPI: campo de texto com lista de resultados logo abaixo
export function SelecaoItem({
  id,
  texto,
  itens,
  onTexto,
  onEscolher,
}: {
  id?: string;
  texto: string;
  itens: ItemSinapi[];
  onTexto: (texto: string) => void;
  onEscolher: (item: ItemSinapi) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const mostrar = aberto && itens.length > 0;

  const escolher = (item: ItemSinapi) => {
    onEscolher(item);
    setAberto(false);
  };

  return (
    <div
      className="avaliacao-combo"
      ref={raiz}
      onBlur={(e) => {
        if (!raiz.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <input
        role="combobox"
        id={id}
        aria-label={id ? undefined : 'Item'}
        aria-expanded={mostrar}
        aria-controls="avaliacao-combo-lista"
        aria-autocomplete="list"
        autoComplete="off"
        maxLength={120}
        placeholder="Buscar item por código ou descrição"
        value={texto}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          onTexto(e.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
            setDestaque((d) => Math.min(d + 1, itens.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
          } else if (e.key === 'Enter' && mostrar) {
            e.preventDefault();
            escolher(itens[destaque] ?? itens[0]);
          } else if (e.key === 'Escape') {
            setAberto(false);
          }
        }}
      />
      {mostrar && (
        <ul id="avaliacao-combo-lista" role="listbox" className="avaliacao-combo-lista">
          {itens.map((i, idx) => (
            <li
              key={i.id}
              role="option"
              aria-selected={idx === destaque}
              className={idx === destaque ? 'ativo' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(i)}
            >
              <span className="avaliacao-combo-codigo">{i.codigo}</span>
              <span className="avaliacao-combo-texto">{i.descricao}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Parte de baixo da avaliação técnica: o que não está nas seções da página (materiais previstos, orientações, parecer)
// e a decisão do destino: seguir em análise, encaminhar ao prestador ou encerrar (encerrado, duplicado, unificado).
