import type { ReactNode } from 'react';

interface ModalProps {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  acaoHeader?: ReactNode;
}

export function Modal({ titulo, subtitulo, onFechar, children, acaoHeader }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={onFechar} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="modal-header">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && <div className="modal-sub">{subtitulo}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {acaoHeader}
            <button className="modal-close" onClick={onFechar} aria-label="Fechar">
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
