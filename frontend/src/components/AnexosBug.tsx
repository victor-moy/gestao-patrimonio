import { useEffect, useMemo, useRef } from 'react';
import { MAX_ANEXOS_BUG, TIPOS_ANEXO } from '../utils/relato';

interface Props {
  arquivos: File[];
  onAdicionar: (novos: File[]) => void;
  onRemover: (indice: number) => void;
}

function tamanho(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function LinhaAnexo({ arquivo, onRemover }: { arquivo: File; onRemover: () => void }) {
  const preview = useMemo(() => (arquivo.type.startsWith('image/') ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <li className="anexos-bug-item">
      {preview ? (
        <img src={preview} alt="" className="anexos-bug-miniatura" />
      ) : (
        <span className="anexos-bug-miniatura anexos-bug-pdf" aria-hidden>
          PDF
        </span>
      )}
      <span className="campo-anexo-nome" title={arquivo.name}>
        {arquivo.name}
      </span>
      <span className="anexos-bug-tamanho">{tamanho(arquivo.size)}</span>
      <button type="button" className="anexos-bug-remover" aria-label={`Remover ${arquivo.name}`} onClick={onRemover}>
        Remover
      </button>
    </li>
  );
}

// Lista de anexos do bug no padrão do campo de anexo do sistema: uma linha por arquivo (miniatura, nome, Remover)
// e o botão para adicionar mais, até o limite.
export function AnexosBug({ arquivos, onAdicionar, onRemover }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const cheio = arquivos.length >= MAX_ANEXOS_BUG;
  return (
    <div className="anexos-bug">
      <input
        ref={input}
        type="file"
        multiple
        accept={TIPOS_ANEXO.join(',')}
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-label="Escolher arquivos"
        onChange={(e) => {
          onAdicionar(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {arquivos.length > 0 && (
        <ul className="anexos-bug-lista" aria-label="Arquivos anexados">
          {arquivos.map((arquivo, i) => (
            <LinhaAnexo key={`${arquivo.name}-${arquivo.size}-${i}`} arquivo={arquivo} onRemover={() => onRemover(i)} />
          ))}
        </ul>
      )}
      <div className="campo-anexo-vazio">
        <button type="button" className="btn btn-outline anexos-bug-botao" disabled={cheio} onClick={() => input.current?.click()}>
          {arquivos.length === 0 ? 'Anexar arquivo' : 'Anexar outro'}
        </button>
        <span>
          PDF, PNG, JPG ou WebP até 3 MB · {arquivos.length} de {MAX_ANEXOS_BUG}
        </span>
      </div>
    </div>
  );
}
