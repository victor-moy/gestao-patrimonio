import { useEffect, useMemo, useRef, useState } from 'react';
import type { Equipamento } from '../types';
import { IconeBusca, IconeChevron } from './icons';

interface SeletorEquipamentoProps {
  equipamentos: Equipamento[];
  value: string;
  onChange: (equipamentoId: string) => void;
  placeholder?: string;
  required?: boolean;
  // Ids a esconder da lista (ex: já escolhidos em outras linhas da mesma
  // solicitação de Substituição) — não deve incluir o próprio `value`.
  idsExcluidos?: string[];
}

function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Combobox com busca — irmão do SeletorTipoEquipamento, mas pra escolher um
// equipamento específico (por tombamento) do inventário da unidade, ao invés
// de um tipo do catálogo. Reaproveita as mesmas classes CSS (seletor-tipo-*)
// pra manter o visual idêntico entre os dois componentes.
export function SeletorEquipamento({
  equipamentos,
  value,
  onChange,
  placeholder = 'Selecione o equipamento...',
  required,
  idsExcluidos,
}: SeletorEquipamentoProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selecionado = useMemo(
    () => equipamentos.find((eq) => eq.id === value) ?? null,
    [equipamentos, value],
  );

  const gruposFiltrados = useMemo(() => {
    const alvo = normalizar(busca.trim());
    const excluidos = new Set(idsExcluidos ?? []);
    const visiveis = equipamentos.filter(
      (eq) =>
        !excluidos.has(eq.id) &&
        (!alvo ||
          normalizar(eq.tombamento).includes(alvo) ||
          normalizar(eq.tipoEquipamento.nome).includes(alvo) ||
          normalizar(eq.descricao ?? '').includes(alvo)),
    );
    const porCategoria = new Map<string, Equipamento[]>();
    for (const eq of visiveis) {
      const chave = eq.tipoEquipamento.categoria?.nome ?? 'Outros';
      if (!porCategoria.has(chave)) porCategoria.set(chave, []);
      porCategoria.get(chave)!.push(eq);
    }
    return [...porCategoria.entries()]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [equipamentos, busca, idsExcluidos]);

  const itensPlanos = useMemo(() => gruposFiltrados.flatMap((c) => c.itens), [gruposFiltrados]);

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
          {selecionado ? `${selecionado.tombamento} — ${selecionado.tipoEquipamento.nome}` : placeholder}
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
              placeholder="Buscar por tombamento, tipo ou descrição..."
            />
          </div>
          <div className="seletor-tipo-lista">
            {gruposFiltrados.map((categoria) => (
              <div key={categoria.nome} className="seletor-tipo-grupo">
                <div className="seletor-tipo-grupo-titulo">{categoria.nome}</div>
                {categoria.itens.map((eq) => {
                  const indice = itensPlanos.indexOf(eq);
                  return (
                    <button
                      type="button"
                      key={eq.id}
                      className={`seletor-tipo-item${indice === indiceAtivo ? ' ativo' : ''}${eq.id === value ? ' selecionado' : ''}`}
                      onMouseEnter={() => setIndiceAtivo(indice)}
                      onClick={() => selecionar(eq.id)}
                    >
                      <span>{eq.tipoEquipamento.nome}</span>
                      <span className="seletor-tipo-codigo">{eq.tombamento}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {itensPlanos.length === 0 && (
              <div className="seletor-tipo-vazio">Nenhum equipamento encontrado para "{busca}".</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
