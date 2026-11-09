import { useEffect, useRef, useState } from 'react';

export interface ItemAcao {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  desabilitada?: boolean;
  // Explica por que a ação está indisponível (aparece sob o rótulo)
  dica?: string;
}

// Botão "Ações" do topo do detalhe: abre a lista do que o usuário pode fazer naquele chamado agora.
// Ações diretas executam na hora; as que pedem dados abrem um painel logo abaixo do cabeçalho.
export function MenuAcoes({ itens, ocupado = false }: { itens: ItemAcao[]; ocupado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (itens.length === 0) return null;

  const fechar = () => {
    setAberto(false);
    botao.current?.focus();
  };

  return (
    <div
      className="menu-acoes"
      ref={raiz}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && aberto) {
          e.stopPropagation();
          fechar();
        }
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && aberto) {
          e.preventDefault();
          const itensDom = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
          const atual = itensDom.indexOf(document.activeElement as HTMLButtonElement);
          const proximo = e.key === 'ArrowDown' ? (atual + 1) % itensDom.length : (atual - 1 + itensDom.length) % itensDom.length;
          itensDom[proximo]?.focus();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className="btn btn-primary menu-acoes-botao"
        aria-haspopup="menu"
        aria-expanded={aberto}
        disabled={ocupado}
        onClick={() => setAberto((a) => !a)}
      >
        Ações
        <span className="menu-acoes-seta" aria-hidden="true" />
      </button>
      {aberto && (
        <div className="menu-acoes-lista" role="menu" aria-label="Ações">
          {itens.map((i) => (
            <button
              key={i.id}
              type="button"
              role="menuitem"
              className="menu-acoes-item"
              disabled={i.desabilitada}
              onClick={() => {
                setAberto(false);
                i.aoEscolher();
              }}
            >
              <span>{i.rotulo}</span>
              {i.dica && <span className="menu-acoes-dica">{i.dica}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
