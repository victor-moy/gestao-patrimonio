import type { ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';

interface ModalProps {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  acaoHeader?: ReactNode;
}

export function Modal({ titulo, subtitulo, onFechar, children, acaoHeader }: ModalProps) {
  const dialog = useDialog(onFechar);
  return (
    <div className="modal-overlay" onClick={onFechar} role="presentation">
      <div ref={dialog} tabIndex={-1} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-header">
          <div>
            <h3>{titulo}</h3>
            {subtitulo && <div className="modal-sub">{subtitulo}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {acaoHeader}
            <button type="button" className="modal-close" onClick={onFechar} aria-label="Fechar">
              ✕
            </button>
          </div>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}
