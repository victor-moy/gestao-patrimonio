import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Categoria, Unidade } from '../../types';

const OPCOES_PERIODO = [
  { valor: '', rotulo: 'Todo o período' },
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7dias', rotulo: 'Últimos 7 dias' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: '3meses', rotulo: 'Últimos 3 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
];

function aData(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Um único seletor de período (em vez de dois campos de data) — traduz um
// preset em dataInicio/dataFim, que é o que os endpoints já esperam.
export function calcularPeriodo(preset: string): { dataInicio: string; dataFim: string } {
  const hoje = new Date();
  const fim = aData(hoje);
  if (preset === 'hoje') return { dataInicio: fim, dataFim: fim };
  if (preset === '7dias') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 6);
    return { dataInicio: aData(inicio), dataFim: fim };
  }
  if (preset === 'mes') {
    return { dataInicio: aData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), dataFim: fim };
  }
  if (preset === '3meses') {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 89);
    return { dataInicio: aData(inicio), dataFim: fim };
  }
  if (preset === 'ano') {
    return { dataInicio: aData(new Date(hoje.getFullYear(), 0, 1)), dataFim: fim };
  }
  return { dataInicio: '', dataFim: '' };
}

// Filtros dos relatórios com <select> nativo — o mesmo controle dos demais formulários.
export function FiltroUnidade({
  unidades,
  selecionados,
  onChange,
}: {
  unidades: Unidade[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <select
      aria-label="Unidade de origem"
      value={selecionados[0] ?? ''}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
    >
      <option value="">Todas</option>
      {unidades.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nome}
        </option>
      ))}
    </select>
  );
}

// Período: presets rápidos ou um intervalo personalizado (duas datas) logo abaixo.
export function FiltroPeriodo({
  dataInicio,
  dataFim,
  onChange,
}: {
  dataInicio: string;
  dataFim: string;
  onChange: (dataInicio: string, dataFim: string) => void;
}) {
  const [personalizado, setPersonalizado] = useState(Boolean(dataInicio || dataFim));
  const [preset, setPreset] = useState('');

  function escolher(valor: string) {
    if (valor === 'personalizado') {
      setPersonalizado(true);
      return;
    }
    setPersonalizado(false);
    setPreset(valor);
    const calculado = calcularPeriodo(valor);
    onChange(calculado.dataInicio, calculado.dataFim);
  }

  return (
    <div className="filtro-periodo">
      <select
        aria-label="Período"
        value={personalizado ? 'personalizado' : preset}
        onChange={(e) => escolher(e.target.value)}
      >
        {OPCOES_PERIODO.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
        <option value="personalizado">Personalizado</option>
      </select>
      {personalizado && (
        <div className="filtro-periodo-datas">
          <input
            type="date"
            aria-label="Data inicial"
            value={dataInicio}
            onChange={(e) => onChange(e.target.value, dataFim)}
          />
          <input
            type="date"
            aria-label="Data final"
            value={dataFim}
            onChange={(e) => onChange(dataInicio, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}


// Opções dos filtros (unidades e categorias), compartilhadas pelos relatórios; falhas ficam visíveis.
export function useOpcoesFiltro() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Unidade[]>('/unidades'), api.get<Categoria[]>('/categorias')])
      .then(([u, c]) => {
        setUnidades(u);
        setCategorias(c);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os filtros.'));
  }, []);

  return { unidades, categorias, erro };
}
