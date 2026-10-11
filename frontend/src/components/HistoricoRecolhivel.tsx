import { useState, type ReactNode } from 'react';
import { IconeChevron } from './icons';

interface HistoricoRecolhivelProps {
  // Prefixo dos ids usados para ligar o botão ao conteúdo (único por tela)
  id: string;
  children: ReactNode;
}

// Card "Histórico" que começa recolhido: consulta eventual, não parte do fluxo.
export function HistoricoRecolhivel({ id, children }: HistoricoRecolhivelProps) {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="equipamento-secao historico-card" aria-labelledby={`${id}-titulo`}>
      <div className="historico-cabecalho">
        <h3 id={`${id}-titulo`}>Histórico</h3>
        <button
          type="button"
          className={`historico-alternar${aberto ? ' aberto' : ''}`}
          aria-expanded={aberto}
          aria-controls={`${id}-conteudo`}
          aria-label={aberto ? 'Recolher histórico' : 'Expandir histórico'}
          title={aberto ? 'Recolher' : 'Expandir'}
          onClick={() => setAberto((atual) => !atual)}
        >
          <IconeChevron />
        </button>
      </div>
      <div id={`${id}-conteudo`} className="historico-conteudo" hidden={!aberto}>
        {children}
      </div>
    </section>
  );
}
