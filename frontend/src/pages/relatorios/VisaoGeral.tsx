import '../Relatorios.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { SelectTipoEquipamento } from '../../components/SelectItem';
import { FiltroPeriodo, FiltroUnidade, useOpcoesFiltro } from './filtros';
import type { RankingUnidadeTipo, ResumoItem, VisaoGeralTipo } from '../../types';
import { formatarMoeda, ROTULO_TIPO_SOLICITACAO } from '../../utils/format';

// Cessão de Uso fica de fora do ranking por unidade: a unidade de origem ali
// é o galpão que tinha o estoque, não uma unidade solicitando — rankear não
// responde à mesma pergunta que pros outros 4 tipos.
type TipoRanking = keyof Omit<RankingUnidadeTipo, 'unidadeId' | 'unidade'>;
const TIPOS_RANKING: TipoRanking[] = ['SUBSTITUICAO', 'AMPLIACAO', 'EMPRESTIMO', 'RECOLHA'];

// Relatório 1 — funil de Solicitações por tipo (3 grupos, já que os 13
// status brutos ficariam ilegíveis num gráfico) + ranking de unidades com os
// 4 tipos lado a lado num gráfico só (feedback do cliente: dinâmico, sem
// escolher um tipo por vez).
export function RelatorioVisaoGeral() {
  const [dados, setDados] = useState<VisaoGeralTipo[] | null>(null);
  const [ranking, setRanking] = useState<RankingUnidadeTipo[] | null>(null);
  const [resumoItem, setResumoItem] = useState<ResumoItem | null>(null);
  const { unidades, categorias, erro: erroOpcoes } = useOpcoesFiltro();
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeIds: [] as string[],
    tipoEquipamentoId: '',
  });

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

  // Resumo do item — sempre visível: com um item filtrado, escopado a ele;
  // sem filtro, agrega todos os itens.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filtros.tipoEquipamentoId) params.set('tipoEquipamentoId', filtros.tipoEquipamentoId);
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
      {(erro ?? erroOpcoes) && <div className="error-banner" role="alert">{erro ?? erroOpcoes}</div>}
      <div className="card card-pad rel-filtros">
        <div className="relatorios-filtros-gerais">
          <div>
            <label>Período</label>
            <FiltroPeriodo
              dataInicio={filtros.dataInicio}
              dataFim={filtros.dataFim}
              onChange={(dataInicio, dataFim) => setFiltros({ ...filtros, dataInicio, dataFim })}
            />
          </div>
          <div>
            <label>Unidade de origem</label>
            <FiltroUnidade
              unidades={unidades}
              selecionados={filtros.unidadeIds}
              onChange={(ids) => setFiltros({ ...filtros, unidadeIds: ids })}
            />
          </div>
          <div>
            <label>Item</label>
            <SelectTipoEquipamento
              label="Item"
              categorias={categorias}
              value={filtros.tipoEquipamentoId}
              onChange={(id) => setFiltros({ ...filtros, tipoEquipamentoId: id })}
              placeholder="Todos os itens"
            />
          </div>
        </div>
      </div>

      {dados && (
        <div className="stats-grid rel-kpis">
          <div className="card stat-card">
            <div className="stat-label">Total de solicitações</div>
            <div className="stat-linha">
              <span className="stat-value">{totalGeral}</span>
            </div>
          </div>
          {[
            { rotulo: 'Em andamento', valor: totalEmAndamento, classe: 'andamento' },
            { rotulo: 'Concluídas', valor: totalConcluida, classe: 'concluida' },
            { rotulo: 'Negadas / canceladas', valor: totalNegada, classe: 'negada' },
          ].map((k) => (
            <div className="card stat-card" key={k.classe}>
              <div className="stat-label">
                <span className={`stat-dot stat-dot--${k.classe}`} aria-hidden /> {k.rotulo}
              </div>
              <div className="stat-linha">
                <span className="stat-value">{k.valor}</span>
                <span className="stat-sub">{percentual(k.valor)}% do total</span>
              </div>
              <div className="stat-trilho" aria-hidden>
                <div className={`stat-trilho-fill stat-trilho-fill--${k.classe}`} style={{ width: `${percentual(k.valor)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {resumoItem && (
        <div className="card card-pad resumo-item-card">
          <div className="rel-cabecalho">
            <h3>{filtros.tipoEquipamentoId ? 'Item selecionado' : 'Resumo geral'}</h3>
            <p>{resumoItem.itemNome}</p>
          </div>
          <div className="resumo-item-stats">
            <div className="resumo-item-stat">
              <div className="resumo-item-stat-label">Entregues</div>
              <div className="resumo-item-stat-valor">{resumoItem.entregue}</div>
            </div>
            <div className="resumo-item-stat">
              <div className="resumo-item-stat-label">Pendentes</div>
              <div className="resumo-item-stat-valor">{resumoItem.pendente}</div>
            </div>
            <div className="resumo-item-stat">
              <div className="resumo-item-stat-label">Aguardando estoque</div>
              <div className="resumo-item-stat-valor">{resumoItem.demandaQuantidade}</div>
            </div>
            <div className="resumo-item-stat">
              <div className="resumo-item-stat-label">Previsão de custo da demanda</div>
              <div className="resumo-item-stat-valor">{formatarMoeda(resumoItem.demandaValor)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="relatorios-graficos">
        <div className="card card-pad">
          <div className="rel-cabecalho">
            <h3>Solicitações por tipo</h3>
            <p>Volume total e situação de cada demanda</p>
          </div>
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
                          {d.emAndamento > 0 && (
                            <div
                              className="segmento segmento--andamento"
                              style={{ flexGrow: d.emAndamento }}
                              title={`Em andamento: ${d.emAndamento}`}
                            />
                          )}
                          {d.concluida > 0 && (
                            <div
                              className="segmento segmento--concluida"
                              style={{ flexGrow: d.concluida }}
                              title={`Concluídas: ${d.concluida}`}
                            />
                          )}
                          {d.negadaCancelada > 0 && (
                            <div
                              className="segmento segmento--negada"
                              style={{ flexGrow: d.negadaCancelada }}
                              title={`Negadas / canceladas: ${d.negadaCancelada}`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
          <div className="rel-cabecalho">
            <h3>Unidades com mais solicitações</h3>
            <p>Ranking por volume</p>
          </div>
          {ranking ? (
            rankingComTotal.length > 0 ? (
              <div className="ranking-lista">
                {rankingComTotal.map((u, i) => (
                  <div key={u.unidadeId} className="ranking-linha">
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
                  </div>
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
    </>
  );
}

