import { useRef } from 'react';

interface CampoAnexoProps {
  arquivo: File | null;
  // URL de pré-visualização (só para imagens); PDF fica sem miniatura
  preview: string | null;
  onSelecionar: (arquivo: File) => void;
  onRemover: () => void;
  // Versão de uma linha para dentro de tabelas/listas: botão "Anexar" e, com
  // arquivo, o nome truncado + botão de remover.
  compacto?: boolean;
  // Tipos aceitos e dica exibida ao lado do botão (padrão: PDF e imagens)
  accept?: string;
  dica?: string;
}

// Campo de anexo: botão secundário + dica quando vazio; linha com miniatura,
// nome e botão "Remover" quando há arquivo.
export function CampoAnexo({
  arquivo,
  preview,
  onSelecionar,
  onRemover,
  compacto,
  accept = 'application/pdf,image/jpeg,image/png,image/webp',
  dica = 'PDF, PNG, JPG ou WebP até 5MB',
}: CampoAnexoProps) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="campo-anexo">
      <input
        ref={input}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        tabIndex={-1}
        onChange={(e) => {
          const escolhido = e.target.files?.[0];
          if (escolhido) onSelecionar(escolhido);
          e.target.value = '';
        }}
      />
      {compacto ? (
        arquivo ? (
          <div className="campo-anexo-chip">
            <span className="campo-anexo-nome" title={arquivo.name}>
              {arquivo.name}
            </span>
            <button type="button" aria-label="Remover anexo" title="Remover anexo" onClick={onRemover}>
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-outline"
            title={dica}
            aria-label="Anexar arquivo"
            onClick={() => input.current?.click()}
          >
            Anexar
          </button>
        )
      ) : arquivo ? (
        <div className="campo-anexo-arquivo">
          {preview ? (
            <img src={preview} alt="" className="campo-anexo-miniatura" />
          ) : (
            <span className="campo-anexo-miniatura campo-anexo-pdf" aria-hidden>
              PDF
            </span>
          )}
          <span className="campo-anexo-nome" title={arquivo.name}>
            {arquivo.name}
          </span>
          <button type="button" className="btn btn-outline" onClick={onRemover}>
            Remover
          </button>
        </div>
      ) : (
        <div className="campo-anexo-vazio">
          <button type="button" className="btn btn-outline" onClick={() => input.current?.click()}>
            Selecionar arquivo
          </button>
          <span>{dica}</span>
        </div>
      )}
    </div>
  );
}
