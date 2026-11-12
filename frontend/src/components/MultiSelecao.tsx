import { useRef, useState } from 'react';

interface Opcao {
  id: string;
  nome: string;
}

// Seleção de várias opções: um campo que mostra o que foi escolhido e abre uma lista com caixas de marcação.
export function MultiSelecao({
  id,
  opcoes,
  valor,
  onChange,
  placeholder = 'Selecione…',
  semOpcoes = 'Nenhuma opção disponível',
}: {
  id: string;
  opcoes: Opcao[];
  valor: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  semOpcoes?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const escolhidas = opcoes.filter((o) => valor.includes(o.id));
  const resumo = escolhidas.map((o) => o.nome).join(', ');

  const alternar = (opcaoId: string) =>
    onChange(valor.includes(opcaoId) ? valor.filter((v) => v !== opcaoId) : [...valor, opcaoId]);

  return (
    <div
      className="multi-selecao"
      ref={raiz}
      onBlur={(e) => {
        if (!raiz.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && aberto) {
          e.stopPropagation();
          setAberto(false);
        }
      }}
    >
      <button
        type="button"
        id={id}
        className="multi-selecao-botao"
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        <span className={resumo ? 'multi-selecao-valor' : 'multi-selecao-vazio'}>{resumo || placeholder}</span>
      </button>
      {aberto && (
        <div className="multi-selecao-lista" role="group" aria-label="Opções" onMouseDown={(e) => e.preventDefault()}>
          {opcoes.length === 0 ? (
            <p className="multi-selecao-sem">{semOpcoes}</p>
          ) : (
            opcoes.map((o) => (
              <label key={o.id} className="multi-selecao-opcao">
                <input type="checkbox" checked={valor.includes(o.id)} onChange={() => alternar(o.id)} />
                <span>{o.nome}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
