import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Badge } from '../components/Badge';
import { IconeChevron } from '../components/icons';
import type {
  CessaoRelatorio,
  EmprestimoRelatorio,
  EstoqueAguardandoItem,
  RankingUnidadeTipo,
  RelatorioCessoes,
  RelatorioEmprestimos,
  TipoSolicitacao,
  Unidade,
  VisaoGeralTipo,
} from '../types';
import { capitalizarPalavras, formatarData, formatarMoeda, ROTULO_STATUS_SOLICITACAO, ROTULO_TIPO_SOLICITACAO } from '../utils/format';

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
const TIPOS_RANKING: TipoSolicitacao[] = ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'];
const CORES_RANKING: Record<string, string> = {
  SUBSTITUICAO: '#0e4e6e',
  AMPLIACAO: '#1d6fa3',
  EMPRESTIMO: '#c98f3d',
  RECOLHA: '#7c3aed',
};

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
        <div className="seletor-tipo-painel" role="listbox">
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
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', unidadeIds: [] as string[] });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
    if (filtros.unidadeIds.length > 0) params.set('unidadeId', filtros.unidadeIds.join(','));
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
            <SeletorMultiploUnidades
              unidades={unidades}
              selecionados={filtros.unidadeIds}
              onChange={(ids) => setFiltros({ ...filtros, unidadeIds: ids })}
            />
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

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Ranking de Unidades por Tipo</h3>
        {ranking && ranking.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, ranking.length * 50)}>
            <BarChart data={ranking} layout="vertical" margin={{ left: 8 }}>
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="unidade" width={140} fontSize={12} />
              <Tooltip />
              <Legend />
              {TIPOS_RANKING.map((t) => (
                <Bar key={t} dataKey={t} name={ROTULO_TIPO_SOLICITACAO[t]} fill={CORES_RANKING[t]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : ranking ? (
          <div className="empty-state">Sem solicitações para os filtros selecionados</div>
        ) : (
          <div className="empty-state">Carregando…</div>
        )}
      </div>
    </>
  );
}

// Relatório 2 — prazos e devoluções de Empréstimo.
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

// Relatório 3 — prestação de contas de Cessão de Uso.
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

// Relatório 4 — Itens e Estoque: o que está represado em Aguardando
// Disponibilidade, sem estoque suficiente pra reservar agora. Antes vivia
// dentro da tela de Estoque, virou um relatório dedicado.
function RelatorioItensEstoque() {
  const [dados, setDados] = useState<EstoqueAguardandoItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<EstoqueAguardandoItem[]>('/relatorios/itens-estoque')
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  const verbaTotal = (dados ?? []).reduce((total, item) => {
    const preco = item.tipoEquipamento.preco;
    if (preco === null || preco === undefined) return total;
    return total + Number(preco) * item.quantidade;
  }, 0);

  return (
    <>
      {erro && <div className="error-banner">{erro}</div>}
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
