import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import type {
  Categoria,
  CessaoRelatorio,
  DashboardData,
  EmprestimoRelatorio,
  RankingUnidadeTipo,
  RelatorioCessoes,
  RelatorioEmprestimos,
  TipoSolicitacao,
  Unidade,
  VisaoGeralTipo,
} from '../types';
import { formatarData, formatarMoedaCompacta, ROTULO_STATUS_SOLICITACAO, ROTULO_TIPO_SOLICITACAO } from '../utils/format';

type OpcaoRelatorio = 'indicadores' | 'visao-geral' | 'ranking-unidades' | 'emprestimos' | 'cessoes';

const OPCOES: Array<{ valor: OpcaoRelatorio; rotulo: string; soGestorPatrimonio?: boolean }> = [
  { valor: 'indicadores', rotulo: 'Indicadores de Manutenção e Inventário' },
  { valor: 'visao-geral', rotulo: 'Visão Geral de Solicitações', soGestorPatrimonio: true },
  { valor: 'ranking-unidades', rotulo: 'Ranking de Unidades por Tipo', soGestorPatrimonio: true },
  { valor: 'emprestimos', rotulo: 'Empréstimos — Prazos e Devoluções', soGestorPatrimonio: true },
  { valor: 'cessoes', rotulo: 'Cessões de Uso — Prestação de Contas', soGestorPatrimonio: true },
];

// Cessão de Uso fica de fora do ranking por unidade: a unidade de origem ali
// é o galpão que tinha o estoque, não uma unidade solicitando — rankear não
// responde à mesma pergunta que pros outros 4 tipos.
const TIPOS_RANKING: TipoSolicitacao[] = ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'];

export function Relatorios() {
  const { usuario } = useAuth();
  const [relatorio, setRelatorio] = useState<OpcaoRelatorio>('indicadores');

  const opcoesVisiveis = OPCOES.filter(
    (o) => !o.soGestorPatrimonio || usuario?.perfil === 'GESTOR_PATRIMONIO',
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Relatórios</h2>
          <p className="subtitle">Indicadores operacionais e relatórios de Solicitações</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="field" style={{ maxWidth: 360 }}>
          <label>Relatório</label>
          <select value={relatorio} onChange={(e) => setRelatorio(e.target.value as OpcaoRelatorio)}>
            {opcoesVisiveis.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {relatorio === 'indicadores' && <PainelIndicadores />}
      {relatorio === 'visao-geral' && <RelatorioVisaoGeral />}
      {relatorio === 'ranking-unidades' && <RelatorioRankingUnidades />}
      {relatorio === 'emprestimos' && <RelatorioEmprestimos />}
      {relatorio === 'cessoes' && <RelatorioCessoes />}
    </>
  );
}

// Conteúdo original da tela — indicadores de equipamento/manutenção
// (RF36/RF37). Extraído sem mudança de lógica.
function PainelIndicadores() {
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
      {erro && <div className="error-banner">{erro}</div>}

      <div className="card" style={{ marginTop: 20 }}>
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

// Relatório 1 — funil de Solicitações por tipo, em 3 grupos (os 13 status
// brutos ficariam ilegíveis num gráfico).
function RelatorioVisaoGeral() {
  const [dados, setDados] = useState<VisaoGeralTipo[] | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', unidadeId: '' });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    api
      .get<VisaoGeralTipo[]>(`/relatorios/visao-geral?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, []);

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
      <div className="card" style={{ marginTop: 20 }}>
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
            <label style={{ fontSize: 12 }}>Unidade de origem</label>
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
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Solicitações por Tipo e Status</h3>
        {dados ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={dados.map((d) => ({ ...d, tipoLabel: ROTULO_TIPO_SOLICITACAO[d.tipo] }))}
              layout="vertical"
              margin={{ left: 8 }}
            >
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="tipoLabel" width={130} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="emAndamento" name="Em andamento" stackId="a" fill="#c98f3d" />
              <Bar dataKey="concluida" name="Concluída" stackId="a" fill="#16a34a" />
              <Bar dataKey="negadaCancelada" name="Negada / Cancelada" stackId="a" fill="#9ca3af" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">Carregando…</div>
        )}
      </div>
    </>
  );
}

// Relatório 2 — quais unidades mais abrem cada tipo, separadamente (não
// somado como no ranking geral do painel de indicadores).
function RelatorioRankingUnidades() {
  const [dados, setDados] = useState<RankingUnidadeTipo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ tipo: 'SUBSTITUICAO' as TipoSolicitacao, dataInicio: '', dataFim: '' });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    api
      .get<RankingUnidadeTipo[]>(`/relatorios/ranking-unidades?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="toolbar">
          <div>
            <label style={{ fontSize: 12 }}>Tipo de solicitação</label>
            <select
              value={filtros.tipo}
              onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as TipoSolicitacao })}
            >
              {TIPOS_RANKING.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_SOLICITACAO[t]}
                </option>
              ))}
            </select>
          </div>
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
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Unidades — {ROTULO_TIPO_SOLICITACAO[filtros.tipo]}</h3>
        {dados && dados.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((u) => (
                  <tr key={u.unidadeId}>
                    <td>{u.unidade}</td>
                    <td>{u.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Sem solicitações para os filtros selecionados</div>
        )}
      </div>
    </>
  );
}

// Relatório 3 — prazos e devoluções de Empréstimo.
function RelatorioEmprestimos() {
  const [dados, setDados] = useState<RelatorioEmprestimos | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', unidadeId: '' });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    api
      .get<RelatorioEmprestimos>(`/relatorios/emprestimos?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, []);

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
      <div className="card" style={{ marginTop: 20 }}>
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
            <label style={{ fontSize: 12 }}>Unidade de origem</label>
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
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: 20 }}>
        <div className="card stat-card">
          <div className="stat-label">Devoluções em Atraso</div>
          <div className="stat-value">{dados ? `${dados.percentualAtraso}%` : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Duração Média do Processo</div>
          <div className="stat-value">
            {dados?.duracaoMediaDias ?? '—'} <small>dias</small>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Empréstimos</h3>
        {dados && dados.itens.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Retorno Previsto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((e: EmprestimoRelatorio) => (
                  <tr key={e.id}>
                    <td>{e.equipamento ?? '—'}</td>
                    <td>{e.unidadeOrigem}</td>
                    <td>{e.unidadeDestino ?? '—'}</td>
                    <td>{e.dataRetornoPrevista ? formatarData(e.dataRetornoPrevista) : '—'}</td>
                    <td>
                      <Badge valor={e.status}>{ROTULO_STATUS_SOLICITACAO[e.status]}</Badge>
                      {e.atrasado && (
                        <span className="badge badge-red" style={{ marginLeft: 6 }}>
                          Atrasado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Sem empréstimos para os filtros selecionados</div>
        )}
      </div>
    </>
  );
}

// Relatório 4 — prestação de contas de Cessão de Uso.
function RelatorioCessoes() {
  const [dados, setDados] = useState<RelatorioCessoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '' });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    api
      .get<RelatorioCessoes>(`/relatorios/cessoes?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
      <div className="card" style={{ marginTop: 20 }}>
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
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Cessões de Uso</h3>
        {dados && dados.itens.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Entidade Externa</th>
                  <th>Equipamento</th>
                  <th>Nº de Patrimônio</th>
                  <th>Unidade de Origem</th>
                  <th>Status</th>
                  <th>Pedido Branet</th>
                  <th>Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((c: CessaoRelatorio) => (
                  <tr key={c.id}>
                    <td>{c.entidadeExternaNome ?? '—'}</td>
                    <td>{c.tipoEquipamento ?? '—'}</td>
                    <td>{c.numerosPatrimonio.join(', ') || '—'}</td>
                    <td>{c.unidadeOrigem}</td>
                    <td>
                      <Badge valor={c.status}>{ROTULO_STATUS_SOLICITACAO[c.status]}</Badge>
                    </td>
                    <td>{c.numeroPedidoBranet ?? '—'}</td>
                    <td>{c.dataConclusao ? formatarData(c.dataConclusao) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Sem cessões para os filtros selecionados</div>
        )}
      </div>
    </>
  );
}
