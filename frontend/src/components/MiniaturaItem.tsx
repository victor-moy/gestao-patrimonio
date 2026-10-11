import { useState } from 'react';
import { urlArquivo } from '../api/client';

/** Miniatura do tipo de item nas listas: a foto do catálogo ou, sem ela (ou se falhar), um quadrado cinza liso. */
export function MiniaturaItem({ imagemUrl }: { imagemUrl?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <span className="miniatura-item" aria-hidden>
      {imagemUrl && !falhou && (
        <img src={urlArquivo(imagemUrl)} alt="" loading="lazy" onError={() => setFalhou(true)} />
      )}
    </span>
  );
}
