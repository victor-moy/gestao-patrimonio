import { useRef } from 'react';
import { IconeFechar } from './icons';

// Campo para anexar vários arquivos de uma vez: botão "Anexar", lista com o nome de cada arquivo e X para remover
export function CampoAnexos({
  id,
  rotulo,
  arquivos,
  onArquivos,
  max,
  accept = 'application/pdf',
  botao = 'Anexar arquivos',
}: {
  id: string;
  rotulo: string;
  arquivos: File[];
  onArquivos: (arquivos: File[]) => void;
  max: number;
  accept?: string;
  botao?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  function adicionar(escolhidos: FileList | null) {
    if (!escolhidos) return;
    onArquivos([...arquivos, ...Array.from(escolhidos)].slice(0, max));
    if (input.current) input.current.value = '';
  }

  return (
    <div className="field">
      <span className="campo-rotulo">{rotulo}</span>
      <input ref={input} id={id} type="file" accept={accept} multiple style={{ display: 'none' }} tabIndex={-1} aria-label={rotulo} onChange={(e) => adicionar(e.target.files)} />
      <div className="campo-anexo">
        <button type="button" className="btn btn-outline" disabled={arquivos.length >= max} onClick={() => input.current?.click()}>
          {botao}
        </button>
      </div>
      {arquivos.length > 0 && (
        <ul className="civil-fotos-lista" aria-label={`${rotulo} anexados`}>
          {arquivos.map((arquivo, i) => (
            <li key={`${arquivo.name}-${i}`} className="campo-anexo-chip">
              <span className="campo-anexo-nome" title={arquivo.name}>
                {arquivo.name}
              </span>
              <button
                type="button"
                className="itens-remover"
                aria-label={`Remover ${arquivo.name}`}
                title="Remover"
                onClick={() => onArquivos(arquivos.filter((_, j) => j !== i))}
              >
                <IconeFechar />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
