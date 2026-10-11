import type { Categoria, Equipamento } from '../types';

// Seleção de item no mesmo componente (<select>) usado nos demais formulários,
// com as opções agrupadas por categoria.

interface SelectEquipamentoProps {
  equipamentos: Equipamento[];
  value: string;
  onChange: (equipamentoId: string) => void;
  label: string;
  required?: boolean;
  // Ids a esconder (ex: já escolhidos em outras linhas da mesma solicitação)
  idsExcluidos?: string[];
}

export function SelectEquipamento({
  equipamentos,
  value,
  onChange,
  label,
  required,
  idsExcluidos = [],
}: SelectEquipamentoProps) {
  const excluidos = new Set(idsExcluidos);
  const grupos = new Map<string, Equipamento[]>();
  for (const eq of equipamentos) {
    if (excluidos.has(eq.id) && eq.id !== value) continue;
    const categoria = eq.tipoEquipamento.categoria?.nome ?? 'Outros';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria)!.push(eq);
  }
  const ordenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">Selecione...</option>
      {ordenados.map(([categoria, itens]) => (
        <optgroup key={categoria} label={categoria}>
          {itens.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.tipoEquipamento.nome} — {eq.tombamento}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

interface SelectTipoEquipamentoProps {
  categorias: Categoria[];
  value: string;
  onChange: (tipoEquipamentoId: string) => void;
  label: string;
  required?: boolean;
  idsExcluidos?: string[];
  placeholder?: string;
}

export function SelectTipoEquipamento({
  categorias,
  value,
  onChange,
  label,
  required,
  idsExcluidos = [],
  placeholder = 'Selecione...',
}: SelectTipoEquipamentoProps) {
  const excluidos = new Set(idsExcluidos);

  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{placeholder}</option>
      {categorias.map((categoria) => {
        const tipos = categoria.tipos.filter((t) => !excluidos.has(t.id) || t.id === value);
        if (tipos.length === 0) return null;
        return (
          <optgroup key={categoria.id} label={categoria.nome}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.codigo})
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
