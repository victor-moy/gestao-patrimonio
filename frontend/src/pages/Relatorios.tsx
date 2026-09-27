import { useCallback, useEffect, useRef, useState } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/client';
import { Badge } from '../components/Badge';
import { IconeChevron } from '../components/icons';
import { Modal } from '../components/Modal';
import { SeletorTipoEquipamento } from '../components/SeletorTipoEquipamento';
import { useAlinhamentoDropdown } from '../hooks/useAlinhamentoDropdown';
import type {
  CessaoRelatorio,
  Categoria,
  DetalheSolicitacaoUnidade,
  EmprestimoRelatorio,
  EstoqueAguardandoItem,
  ItensPorUnidadeResposta,
  RankingUnidadeTipo,
  RelatorioCessoes,
  RelatorioEmprestimos,
  ResumoItem,
  Unidade,
  VisaoGeralTipo,
} from '../types';
import {
  capitalizarPalavras,
  formatarData,
  formatarMes,
  formatarMoeda,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
} from '../utils/format';

type OpcaoRelatorio = 'visao-geral' | 'emprestimos' | 'cessoes' | 'itens-estoque';

const OPCOES: Array<{ valor: OpcaoRelatorio; rotulo: string }> = [
  { valor: 'visao-geral', rotulo: 'Visão Geral de Solicitações' },
  { valor: 'emprestimos', rotulo: 'Empréstimos — Prazos e Devoluções' },
  { valor: 'cessoes', rotulo: 'Cessões de Uso — Prestação de Contas' },
  { valor: 'itens-estoque', rotulo: 'Itens e Estoque' },
];

// Cessão de Uso fica de fora do ranking por unidade: a unidade de origem ali
// é o galpão que tinha o estoque, não uma unidade solicitando — rankear não
// responde à mesma pergunta que pros outros 4 tipos.
type TipoRanking = keyof Omit<RankingUnidadeTipo, 'unidadeId' | 'unidade'>;
const TIPOS_RANKING: TipoRanking[] = ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'];

// Paleta cíclica pras linhas do gráfico de itens por unidade — o número de
// unidades com movimentação varia, não dá pra ter uma cor fixa por unidade.
const PALETA_LINHAS = ['#0e4e6e', '#1d6fa3', '#c98f3d', '#7c3aed', '#16a34a', '#dc2626', '#0891b2', '#be185d'];

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
function calcularPeriodo(preset: string): { dataInicio: string; dataFim: string } {
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

export function Relatorios() {
  const [relatorio, setRelatorio] = useState<OpcaoRelatorio>('visao-geral');

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Relatórios</h2>
          <p className="subtitle">Relatórios gerenciais de Solicitações</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="field" style={{ maxWidth: 360 }}>
          <label>Relatório</label>
          <select value={relatorio} onChange={(e) => setRelatorio(e.target.value as OpcaoRelatorio)}>
            {OPCOES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {relatorio === 'visao-geral' && <RelatorioVisaoGeral />}
      {relatorio === 'emprestimos' && <RelatorioEmprestimos />}
      {relatorio === 'cessoes' && <RelatorioCessoes />}
      {relatorio === 'itens-estoque' && <RelatorioItensEstoque />}
    </>
  );
}

// Dropdown com checkboxes pra escolher várias unidades de uma vez — reaproveita
// a mesma casca visual do combobox de tipo de equipamento (seletor-tipo-*).
function SeletorMultiploUnidades({
  unidades,
  selecionados,
  onChange,
}: {
  unidades: Unidade[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const alinhamento = useAlinhamentoDropdown(containerRef, aberto);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  function alternar(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter((s) => s !== id) : [...selecionados, id]);
  }

  const rotulo =
    selecionados.length === 0
      ? 'Todas'
      : selecionados.length === 1
        ? (unidades.find((u) => u.id === selecionados[0])?.nome ?? 'Todas')
        : `${selecionados.length} unidades selecionadas`;

  return (
    <div className="seletor-tipo" ref={containerRef}>
      <button
        type="button"
        className="seletor-tipo-gatilho"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <span className={selecionados.length === 0 ? 'seletor-tipo-placeholder' : ''}>{rotulo}</span>
        <IconeChevron />
      </button>
      {aberto && (
        <div
          className={`seletor-tipo-painel${alinhamento === 'direita' ? ' seletor-tipo-painel--direita' : ''}`}
          role="listbox"
        >
          <div className="seletor-tipo-lista">
            <button type="button" className="seletor-tipo-item" onClick={() => onChange([])}>
              <span style={{ fontWeight: selecionados.length === 0 ? 600 : 400 }}>Todas</span>
            </button>
            {unidades.map((u) => (
              <label key={u.id} className="seletor-tipo-item" style={{ cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={selecionados.includes(u.id)}
                    onChange={() => alternar(u.id)}
                  />
                  {u.nome}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Relatório 1 — funil de Solicitações por tipo (3 grupos, já que os 13
// status brutos ficariam ilegíveis num gráfico) + ranking de unidades com os
// 4 tipos lado a lado num gráfico só (feedback do cliente: dinâmico, sem
// escolher um tipo por vez).
function RelatorioVisaoGeral() {
  const [dados, setDados] = useState<VisaoGeralTipo[] | null>(null);
  const [ranking, setRanking] = useState<RankingUnidadeTipo[] | null>(null);
  const [resumoItem, setResumoItem] = useState<ResumoItem | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    periodo: '',
    dataInicio: '',
    dataFim: '',
    unidadeIds: [] as string[],
    tipoEquipamentoId: '',
  });
  const [unidadeDetalhe, setUnidadeDetalhe] = useState<{ id: string; nome: string } | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
    if (filtros.unidadeIds.length > 0) params.set('unidadeId', filtros.unidadeIds.join(','));
    if (filtros.tipoEquipamentoId) params.set('tipoEquipamentoId', filtros.tipoEquipamentoId);
    api
      .get<VisaoGeralTipo[]>(`/relatorios/visao-geral?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
    api
      .get<RankingUnidadeTipo[]>(`/relatorios/ranking-unidades?${params}`)
      .then(setRanking)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
  }, []);

  // Resumo do item (entregue/pendente/demanda) só faz sentido com um item
  // específico selecionado — sem filtro, "Itens e Estoque" já cobre a visão
  // agregada de todos os itens.
  useEffect(() => {
    if (!filtros.tipoEquipamentoId) {
      setResumoItem(null);
      return;
    }
    const params = new URLSearchParams({ tipoEquipamentoId: filtros.tipoEquipamentoId });
    if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
    api
      .get<ResumoItem>(`/relatorios/resumo-item?${params}`)
      .then(setResumoItem)
      .catch((e) => setErro(e.message));
  }, [filtros.tipoEquipamentoId, filtros.dataInicio, filtros.dataFim]);

  // Totais gerais pros cards de estatística — soma dos 3 buckets, dos 5 tipos.
  const totalGeral = dados ? dados.reduce((soma, d) => soma + d.emAndamento + d.concluida + d.negadaCancelada, 0) : 0;
  const totalEmAndamento = dados ? dados.reduce((soma, d) => soma + d.emAndamento, 0) : 0;
  const totalConcluida = dados ? dados.reduce((soma, d) => soma + d.concluida, 0) : 0;
  const totalNegada = dados ? dados.reduce((soma, d) => soma + d.negadaCancelada, 0) : 0;
  const percentual = (valor: number) => (totalGeral > 0 ? Math.round((valor / totalGeral) * 100) : 0);

  // Lista de tipos com total, ordenada do maior pro menor volume.
  const tiposComTotal = (dados ?? [])
    .map((d) => ({ ...d, total: d.emAndamento + d.concluida + d.negadaCancelada }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxTipo = Math.max(1, ...tiposComTotal.map((d) => d.total));

  // Ranking com total + tipo dominante ("principal demanda") por unidade.
  const rankingComTotal = (ranking ?? []).map((u) => {
    const total = TIPOS_RANKING.reduce((soma, t) => soma + u[t], 0);
    const dominante = TIPOS_RANKING.reduce((melhor, t) => (u[t] > u[melhor] ? t : melhor), TIPOS_RANKING[0]);
    return { ...u, total, dominante };
  });
  const maxRanking = Math.max(1, ...rankingComTotal.map((u) => u.total));

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="toolbar">
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12 }}>Período</label>
            <select
              value={filtros.periodo}
              onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value, ...calcularPeriodo(e.target.value) })}
            >
              {OPCOES_PERIODO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12 }}>Unidade de origem</label>
            <SeletorMultiploUnidades
              unidades={unidades}
              selecionados={filtros.unidadeIds}
              onChange={(ids) => setFiltros({ ...filtros, unidadeIds: ids })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12 }}>Item</label>
            <SeletorTipoEquipamento
              categorias={categorias}
              value={filtros.tipoEquipamentoId}
              onChange={(id) => setFiltros({ ...filtros, tipoEquipamentoId: id })}
              placeholder="Todos os itens"
            />
          </div>
        </div>
      </div>

      {dados && (
        <div className="stats-grid" style={{ marginTop: 20 }}>
          <div className="card stat-card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className="stat-label">Total de solicitações</div>
            <div className="stat-value">{totalGeral}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>No período selecionado</div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">
              <span className="stat-dot stat-dot--andamento" /> Em andamento
            </div>
            <div className="stat-value">{totalEmAndamento}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
              {percentual(totalEmAndamento)}% do total
            </div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">
              <span className="stat-dot stat-dot--concluida" /> Concluídas
            </div>
            <div className="stat-value">{totalConcluida}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
              {percentual(totalConcluida)}% do total
            </div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">
              <span className="stat-dot stat-dot--negada" /> Negadas / canceladas
            </div>
            <div className="stat-value">{totalNegada}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
              {percentual(totalNegada)}% do total
            </div>
          </div>
        </div>
      )}

      {resumoItem && (
        <div className="stats-grid" style={{ marginTop: 20 }}>
          <div className="card stat-card">
            <div className="stat-label">Entregue — {resumoItem.itemNome}</div>
            <div className="stat-value">{resumoItem.entregue}</div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">Pendente</div>
            <div className="stat-value">{resumoItem.pendente}</div>
          </div>
          <div className="card stat-card">
            <div className="stat-label">Demanda (aguardando estoque)</div>
            <div className="stat-value">{resumoItem.demandaQuantidade}</div>
            {resumoItem.demandaQuantidade > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                {formatarMoeda(resumoItem.demandaValor)} previstos
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, marginTop: 20 }}>
        <div className="card card-pad">
          <h3>Solicitações por tipo</h3>
          <p className="subtitle" style={{ marginTop: -10, marginBottom: 16 }}>
            Volume total e situação de cada demanda
          </p>
          {dados ? (
            tiposComTotal.length > 0 ? (
              <>
                <div className="resumo-legenda">
                  <span>
                    <span className="stat-dot stat-dot--andamento" /> Em andamento
                  </span>
                  <span>
                    <span className="stat-dot stat-dot--concluida" /> Concluídas
                  </span>
                  <span>
                    <span className="stat-dot stat-dot--negada" /> Negadas / canceladas
                  </span>
                </div>
                <div className="resumo-tipo-lista">
                  {tiposComTotal.map((d) => (
                    <div key={d.tipo}>
                      <div className="resumo-tipo-cabecalho">
                        <strong>{ROTULO_TIPO_SOLICITACAO[d.tipo]}</strong>
                        <strong>{d.total}</strong>
                      </div>
                      <div className="resumo-tipo-barra">
                        <div className="resumo-tipo-barra-preenchida" style={{ width: `${(d.total / maxTipo) * 100}%` }}>
                          <div style={{ width: `${(d.emAndamento / d.total) * 100}%`, background: '#c98f3d' }} />
                          <div style={{ width: `${(d.concluida / d.total) * 100}%`, background: '#16a34a' }} />
                          <div style={{ width: `${(d.negadaCancelada / d.total) * 100}%`, background: '#9ca3af' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="resumo-tipo-eixo">
                  <span>0</span>
                  <span>{Math.round(maxTipo / 2)}</span>
                  <span>{maxTipo} solicitações</span>
                </div>
              </>
            ) : (
              <div className="empty-state">Sem solicitações para os filtros selecionados</div>
            )
          ) : (
            <div className="empty-state">Carregando…</div>
          )}
        </div>

        <div className="card card-pad">
          <h3>Unidades com mais solicitações</h3>
          <p className="subtitle" style={{ marginTop: -10, marginBottom: 16 }}>
            Ranking por volume — clique pra ver o detalhe
          </p>
          {ranking ? (
            rankingComTotal.length > 0 ? (
              <div className="ranking-lista">
                {rankingComTotal.map((u, i) => (
                  <button
                    type="button"
                    key={u.unidadeId}
                    className="ranking-linha"
                    onClick={() => setUnidadeDetalhe({ id: u.unidadeId, nome: u.unidade })}
                  >
                    <div className="ranking-cabecalho">
                      <span>
                        <span className="ranking-posicao">{String(i + 1).padStart(2, '0')}</span>
                        {u.unidade}
                      </span>
                      <strong>{u.total}</strong>
                    </div>
                    <div className="ranking-barra">
                      <div className="ranking-barra-fill" style={{ width: `${(u.total / maxRanking) * 100}%` }} />
                    </div>
                    <div className="ranking-demanda">
                      Principal demanda: {ROTULO_TIPO_SOLICITACAO[u.dominante].toLowerCase()}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">Sem solicitações para os filtros selecionados</div>
            )
          ) : (
            <div className="empty-state">Carregando…</div>
          )}
        </div>
      </div>

      {unidadeDetalhe && (
        <DetalheUnidadeModal
          unidadeId={unidadeDetalhe.id}
          unidadeNome={unidadeDetalhe.nome}
          tipoEquipamentoId={filtros.tipoEquipamentoId}
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          onFechar={() => setUnidadeDetalhe(null)}
        />
      )}
    </>
  );
}

// Modal de drill-down do ranking — lista tudo que uma unidade pediu (feedback
// do stakeholder: "descer" o relatório, não só ver o número agregado).
function DetalheUnidadeModal({
  unidadeId,
  unidadeNome,
  tipoEquipamentoId,
  dataInicio,
  dataFim,
  onFechar,
}: {
  unidadeId: string;
  unidadeNome: string;
  tipoEquipamentoId: string;
  dataInicio: string;
  dataFim: string;
  onFechar: () => void;
}) {
  const [itens, setItens] = useState<DetalheSolicitacaoUnidade[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ unidadeId });
    if (tipoEquipamentoId) params.set('tipoEquipamentoId', tipoEquipamentoId);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    api
      .get<DetalheSolicitacaoUnidade[]>(`/relatorios/detalhe-unidade?${params}`)
      .then(setItens)
      .catch((e) => setErro(e.message));
  }, [unidadeId, tipoEquipamentoId, dataInicio, dataFim]);

  return (
    <Modal titulo={unidadeNome} subtitulo="Substituição, Ampliação, Empréstimo e Recolha" onFechar={onFechar}>
      {erro && <div className="error-banner">{erro}</div>}
      {itens && itens.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Item</th>
                <th>Quantidade</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((s) => (
                <tr key={s.id}>
                  <td>{ROTULO_TIPO_SOLICITACAO[s.tipo]}</td>
                  <td>{s.item ?? '—'}</td>
                  <td>{s.quantidade ?? '—'}</td>
                  <td>
                    <Badge valor={s.status}>{ROTULO_STATUS_SOLICITACAO[s.status]}</Badge>
                  </td>
                  <td>{formatarData(s.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : itens ? (
        <div className="empty-state">Sem solicitações para os filtros selecionados</div>
      ) : (
        <div className="empty-state">Carregando…</div>
      )}
    </Modal>
  );
}

// Relatório 2 — prazos e devoluções de Empréstimo.
function RelatorioEmprestimos() {
  const [dados, setDados] = useState<RelatorioEmprestimos | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeId: '',
    tipoEquipamentoId: '',
    busca: '',
  });

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
          <div>
            <label style={{ fontSize: 12 }}>Item</label>
            <SeletorTipoEquipamento
              categorias={categorias}
              value={filtros.tipoEquipamentoId}
              onChange={(id) => setFiltros({ ...filtros, tipoEquipamentoId: id })}
              placeholder="Todos os itens"
            />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Busca por patrimônio</label>
            <input
              type="text"
              placeholder="Tombamento ou descrição..."
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            />
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

// Relatório 3 — prestação de contas de Cessão de Uso.
function RelatorioCessoes() {
  const [dados, setDados] = useState<RelatorioCessoes | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', tipoEquipamentoId: '', busca: '' });

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

  useEffect(() => {
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
            <label style={{ fontSize: 12 }}>Item</label>
            <SeletorTipoEquipamento
              categorias={categorias}
              value={filtros.tipoEquipamentoId}
              onChange={(id) => setFiltros({ ...filtros, tipoEquipamentoId: id })}
              placeholder="Todos os itens"
            />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Busca por patrimônio</label>
            <input
              type="text"
              placeholder="Nº de patrimônio, entidade ou item..."
              value={filtros.busca}
              onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
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

// Relatório 4 — Itens e Estoque: quantidade de equipamentos por unidade ao
// longo do tempo + o que está represado em Aguardando Disponibilidade, sem
// estoque suficiente pra reservar agora. A segunda parte vivia antes dentro
// da tela de Estoque, virou um relatório dedicado.
function RelatorioItensEstoque() {
  const [dados, setDados] = useState<EstoqueAguardandoItem[] | null>(null);
  const [serie, setSerie] = useState<ItensPorUnidadeResposta | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', unidadeIds: [] as string[] });

  useEffect(() => {
    api
      .get<EstoqueAguardandoItem[]>('/relatorios/itens-estoque')
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, []);

  const carregarSerie = useCallback(() => {
    const params = new URLSearchParams();
    if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
    if (filtros.unidadeIds.length > 0) params.set('unidadeId', filtros.unidadeIds.join(','));
    api
      .get<ItensPorUnidadeResposta>(`/relatorios/itens-por-unidade?${params}`)
      .then(setSerie)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregarSerie();
  }, [carregarSerie]);

  const verbaTotal = (dados ?? []).reduce((total, item) => {
    const preco = item.tipoEquipamento.preco;
    if (preco === null || preco === undefined) return total;
    return total + Number(preco) * item.quantidade;
  }, 0);

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
            <SeletorMultiploUnidades
              unidades={unidades}
              selecionados={filtros.unidadeIds}
              onChange={(ids) => setFiltros({ ...filtros, unidadeIds: ids })}
            />
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Quantidade de Itens por Unidade ao Longo do Tempo</h3>
        <p className="subtitle" style={{ marginTop: -4 }}>
          Total acumulado de equipamentos por unidade, mês a mês
        </p>
        {serie && serie.linhas.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={serie.linhas.map((l) => ({ ...l, mes: formatarMes(String(l.mes)) }))} margin={{ left: 8 }}>
              <XAxis dataKey="mes" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              {serie.unidades.map((nome, i) => (
                <Line
                  key={nome}
                  type="monotone"
                  dataKey={nome}
                  stroke={PALETA_LINHAS[i % PALETA_LINHAS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : serie ? (
          <div className="empty-state">Sem movimentações para os filtros selecionados</div>
        ) : (
          <div className="empty-state">Carregando…</div>
        )}
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Itens Aguardando Estoque</h3>
        <p className="subtitle" style={{ marginTop: -4 }}>
          Itens sem estoque suficiente pra reservar agora
        </p>
        {dados && dados.length > 0 ? (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th>Categoria</th>
                  <th>Quantidade</th>
                  <th>Preço Ref.</th>
                  <th>Previsão de Verba</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((item) => {
                  const cor = item.tipoEquipamento.categoria?.cor || '#6b7280';
                  const preco = item.tipoEquipamento.preco;
                  const subtotal = preco === null || preco === undefined ? null : Number(preco) * item.quantidade;
                  return (
                    <tr key={item.tipoEquipamento.id}>
                      <td>{capitalizarPalavras(item.tipoEquipamento.nome)}</td>
                      <td>#{item.tipoEquipamento.codigo}</td>
                      <td>
                        {item.tipoEquipamento.categoria && (
                          <span className="pill-categoria" style={{ background: `${cor}1f`, color: cor }}>
                            {item.tipoEquipamento.categoria.nome}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--yellow-text)' }}>
                          {item.quantidade} <small>un.</small>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatarMoeda(preco)}</td>
                      <td style={{ fontWeight: 600 }}>{subtotal === null ? '—' : formatarMoeda(subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total previsto
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatarMoeda(verbaTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state">Nada aguardando estoque no momento</div>
        )}
      </div>
    </>
  );
}
