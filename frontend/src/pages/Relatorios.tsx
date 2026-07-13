import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import type { Categoria, DashboardData, Unidade } from '../types';
import { formatarMoedaCompacta } from '../utils/format';

// RF37 — dashboards com filtros por período, unidade e tipo de equipamento
export function Relatorios() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeId: '',
    tipoEquipamentoId: '',
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    api
      .get<DashboardData>(`/dashboard?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Relatórios</h2>
          <p className="subtitle">Indicadores operacionais com filtros</p>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="card">
        <div className="toolbar">
          <div>
            <label style={{ fontSize: 12 }}>Período — início</label>
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Período — fim</label>
            <input
              type="date"
              value={filtros.dataFim}
              onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Unidade</label>
            <select
              value={filtros.unidadeId}
              onChange={(e) => setFiltros({ ...filtros, unidadeId: e.target.value })}
            >
              <option value="">Todas</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Tipo de equipamento</label>
            <select
              value={filtros.tipoEquipamentoId}
              onChange={(e) => setFiltros({ ...filtros, tipoEquipamentoId: e.target.value })}
            >
              <option value="">Todos</option>
              {categorias.map((c) => (
                <optgroup key={c.id} label={c.nome}>
                  {c.tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: 20 }}>
        <div className="card stat-card">
          <div className="stat-label">Total de Equipamentos</div>
          <div className="stat-value">{dados?.totalEquipamentos ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Em Manutenção</div>
          <div className="stat-value">{dados?.emManutencao ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Tempo Médio de Manutenção</div>
          <div className="stat-value">
            {dados?.tempoMedioManutencaoDias ?? '—'} <small>dias</small>
          </div>
        </div>
      </div>

      <div className="grid-2-even">
        <div className="card card-pad">
          <h3>Equipamentos por Unidade</h3>
          {dados && dados.equipamentosPorUnidade.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dados.equipamentosPorUnidade} layout="vertical">
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="unidade" width={120} fontSize={12} />
                <Tooltip />
                <Bar dataKey="quantidade" fill="#0e4e6e" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sem dados para os filtros selecionados</div>
          )}
        </div>
        <div className="card card-pad">
          <h3>Custo Semestral de Manutenção</h3>
          {dados ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dados.custoSemestral}>
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatarMoedaCompacta(Number(v))} />
                <Bar dataKey="custo" fill="#1d6fa3" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sem dados</div>
          )}
        </div>
      </div>
    </>
  );
}
