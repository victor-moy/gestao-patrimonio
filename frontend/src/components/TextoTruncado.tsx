import { useRef, useState } from 'react';

// Texto em 1 linha com reticências; quando (e somente quando) estiver
// truncado, mostra um tooltip estilizado imediato no hover.
// Usa position: fixed para escapar de ancestrais com overflow: hidden/auto.
export function TextoTruncado({ texto }: { texto: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  function aoEntrar() {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth) {
      setRect(el.getBoundingClientRect());
    }
  }

  return (
    <span
      className="texto-truncado-wrap"
      onMouseEnter={aoEntrar}
      onMouseLeave={() => setRect(null)}
    >
      <span ref={ref} className="texto-truncado">
        {texto}
      </span>
      {rect && (
        <span
          className="tooltip-texto"
          role="tooltip"
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left,
            transform: 'translateY(-100%)',
          }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
