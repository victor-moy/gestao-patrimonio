import { useEffect, useMemo, useRef, useState } from 'react';
import type { Categoria } from '../types';
import { IconeBusca, IconeChevron } from './icons';

interface SeletorTipoEquipamentoProps {
  categorias: Categoria[];
  value: string;
  onChange: (tipoEquipamentoId: string) => void;
  placeholder?: string;
  required?: boolean;
  // Ids a esconder da lista (ex: já escolhidos em outras linhas da mesma
  // solicitação de Ampliação) — não deve incluir o próprio `value`.
  idsExcluidos?: string[];
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Combobox com busca — substitui o <select> nativo (com optgroup) pra
// escolher um tipo de equipamento entre centenas de itens agrupados por
// categoria. Digitar filtra por nome ou código; navegação por teclado
// (setas, Enter, Esc) e fecha ao clicar fora.
export function SeletorTipoEquipamento({
  categorias,
  value,
  onChange,
  placeholder = 'Selecione o tipo...',
  required,
  idsExcluidos,
}: SeletorTipoEquipamentoProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionado = useMemo(() => {
    for (const c of categorias) {
      const tipo = c.tipos.find((t) => t.id === value);
      if (tipo) return tipo;
    }
    return null;
  }, [categorias, value]);

  const gruposFiltrados = useMemo(() => {
    const alvo = normalizar(busca.trim());
    const excluidos = new Set(idsExcluidos ?? []);
    return categorias
      .map((c) => ({
        ...c,
        tipos: c.tipos.filter(
          (t) =>
            !excluidos.has(t.id) &&
            (!alvo || normalizar(t.nome).includes(alvo) || normalizar(t.codigo).includes(alvo)),
        ),
      }))
      .filter((c) => c.tipos.length > 0);
  }, [categorias, busca, idsExcluidos]);

  const itensPlanos = useMemo(() => gruposFiltrados.flatMap((c) => c.tipos), [gruposFiltrados]);

  useEffect(() => {
    setIndiceAtivo(0);
  }, [busca, aberto]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca('');
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  function abrir() {
    setAberto(true);
    setBusca('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selecionar(id: string) {
    onChange(id);
    setAberto(false);
    setBusca('');
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setAberto(false);
      setBusca('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.min(i + 1, itensPlanos.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = itensPlanos[indiceAtivo];
      if (alvo) selecionar(alvo.id);
    }
  }

  return (
    <div className="seletor-tipo" ref={containerRef}>
      <button
        type="button"
        className="seletor-tipo-gatilho"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <span className={selecionado ? '' : 'seletor-tipo-placeholder'}>
          {selecionado ? selecionado.nome : placeholder}
        </span>
        <IconeChevron />
      </button>
      {/* input escondido só pra garantir validação HTML (required) do form */}
      <input type="text" value={value} required={required} readOnly tabIndex={-1} className="seletor-tipo-shadow" aria-hidden />

      {aberto && (
        <div className="seletor-tipo-painel" role="listbox">
          <div className="seletor-tipo-busca">
            <IconeBusca />
            <input
              ref={inputRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={aoTeclar}
              placeholder="Buscar por nome ou código..."
            />
          </div>
          <div className="seletor-tipo-lista">
            {gruposFiltrados.map((categoria) => (
              <div key={categoria.id} className="seletor-tipo-grupo">
                <div className="seletor-tipo-grupo-titulo">{categoria.nome}</div>
                {categoria.tipos.map((t) => {
                  const indice = itensPlanos.indexOf(t);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      className={`seletor-tipo-item${indice === indiceAtivo ? ' ativo' : ''}${t.id === value ? ' selecionado' : ''}`}
                      onMouseEnter={() => setIndiceAtivo(indice)}
                      onClick={() => selecionar(t.id)}
                    >
                      <span>{t.nome}</span>
                      <span className="seletor-tipo-codigo">{t.codigo}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {itensPlanos.length === 0 && (
              <div className="seletor-tipo-vazio">Nenhum item encontrado para "{busca}".</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
