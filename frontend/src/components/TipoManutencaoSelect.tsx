// Seletor de tipo de manutenção: Preventiva, Corretiva ou Ambas (e, quando permitido, Nenhuma). Guarda dois
// indicadores (preventiva/corretiva) como no banco; "Ambas" é os dois ligados e "Nenhuma" os dois desligados.
// Usado em Tipos de itens (o que aceita, com "Nenhuma") e em Escopos (o que cobre, sem "Nenhuma").
interface Props {
  id: string;
  legenda: string;
  preventiva: boolean;
  corretiva: boolean;
  onChange: (valor: { preventiva: boolean; corretiva: boolean }) => void;
  permitirNenhuma?: boolean;
  disabled?: boolean;
}

const OPCOES = [
  { chave: 'nenhuma', rotulo: 'Nenhuma', valor: { preventiva: false, corretiva: false } },
  { chave: 'preventiva', rotulo: 'Preventiva', valor: { preventiva: true, corretiva: false } },
  { chave: 'corretiva', rotulo: 'Corretiva', valor: { preventiva: false, corretiva: true } },
  { chave: 'ambas', rotulo: 'Ambas', valor: { preventiva: true, corretiva: true } },
];

export function TipoManutencaoSelect({ id, legenda, preventiva, corretiva, onChange, permitirNenhuma, disabled }: Props) {
  const atual = preventiva && corretiva ? 'ambas' : corretiva ? 'corretiva' : preventiva ? 'preventiva' : 'nenhuma';
  return (
    <>
      <label htmlFor={id}>{legenda}</label>
      <select
        id={id}
        value={atual}
        disabled={disabled}
        onChange={(e) => onChange(OPCOES.find((o) => o.chave === e.target.value)!.valor)}
      >
        {OPCOES.filter((o) => permitirNenhuma || o.chave !== 'nenhuma').map((o) => (
          <option key={o.chave} value={o.chave}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </>
  );
}
