import '../Relatorios.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { corDoStatus } from '../../components/Badge';
import { IconeBusca } from '../../components/icons';
import { SelectTipoEquipamento } from '../../components/SelectItem';
import { FiltroPeriodo, FiltroUnidade, useOpcoesFiltro } from './filtros';
import type { EmprestimoRelatorio, RelatorioEmprestimos } from '../../types';
import { formatarData, ROTULO_STATUS_SOLICITACAO } from '../../utils/format';

function percentualDoTotal(dados: RelatorioEmprestimos | null, valor: number | undefined) {
  if (!dados || !valor || dados.total === 0) return 0;
  return Math.round((valor / dados.total) * 100);
}

// Relatório 2 — prazos e devoluções de Empréstimo.
export function RelatorioEmprestimos() {
  const [dados, setDados] = useState<RelatorioEmprestimos | null>(null);
  const { unidades, categorias, erro: erroOpcoes } = useOpcoesFiltro();
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeIds: [] as string[],
    tipoEquipamentoId: '',
    busca: '',
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
    if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
    if (filtros.unidadeIds.length > 0) params.set('unidadeId', filtros.unidadeIds.join(','));
    if (filtros.tipoEquipamentoId) params.set('tipoEquipamentoId', filtros.tipoEquipamentoId);
    if (filtros.busca) params.set('busca', filtros.busca);
    api
      .get<RelatorioEmprestimos>(`/relatorios/emprestimos?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const kpis = [
    { rotulo: 'Em andamento', valor: dados?.emAndamento, classe: 'andamento' },
    { rotulo: 'Concluídos', valor: dados?.concluida, classe: 'concluida' },
    { rotulo: 'Negados / cancelados', valor: dados?.negadaCancelada, classe: 'negada' },
  ];

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
        <label className="rel-busca">
          <IconeBusca />
          <input
            type="text"
            aria-label="Buscar empréstimos"
            placeholder="Buscar por tombamento ou descrição"
            value={filtros.busca}
            onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
          />
        </label>
      </div>

      <div className="stats-grid rel-kpis rel-kpis--seis">
        <div className="card stat-card">
          <div className="stat-label">Total de empréstimos</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.total ?? '—'}</span>
          </div>
        </div>
        {kpis.map((k) => (
          <div className="card stat-card" key={k.classe}>
            <div className="stat-label">
              <span className={`stat-dot stat-dot--${k.classe}`} aria-hidden /> {k.rotulo}
            </div>
            <div className="stat-linha">
              <span className="stat-value">{k.valor ?? '—'}</span>
              <span className="stat-sub">{percentualDoTotal(dados, k.valor)}%</span>
            </div>
            <div className="stat-trilho" aria-hidden>
              <div
                className={`stat-trilho-fill stat-trilho-fill--${k.classe}`}
                style={{ width: `${percentualDoTotal(dados, k.valor)}%` }}
              />
            </div>
          </div>
        ))}
        <div className="card stat-card">
          <div className="stat-label">Devoluções em atraso</div>
          <div className="stat-linha">
            <span className="stat-value">{dados ? `${dados.percentualAtraso}%` : '—'}</span>
          </div>
        </div>
      </div>

      <div className="card rel-tabela">
        <div className="rel-cabecalho rel-cabecalho--tabela">
          <h3>Empréstimos</h3>
        </div>
        {dados && dados.itens.length > 0 ? (
          <div className="rel-tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tombamento</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Retorno previsto</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((e: EmprestimoRelatorio) => (
                  <tr key={e.id}>
                    <td className="rel-tabela-principal">{e.tombamento ?? '—'}</td>
                    <td>{e.unidadeOrigem}</td>
                    <td>{e.unidadeDestino ?? '—'}</td>
                    <td>{e.dataRetornoPrevista ? formatarData(e.dataRetornoPrevista) : '—'}</td>
                    <td>
                      <div className="rel-tabela-status">
                        <span className={`inventario-status inventario-status--tom-${corDoStatus(e.status)}`}>
                          <span aria-hidden />
                          {ROTULO_STATUS_SOLICITACAO[e.status]}
                        </span>
                        {e.atrasado && (
                          <span className="inventario-status inventario-status--tom-red">
                            <span aria-hidden />
                            Atrasado
                          </span>
                        )}
                      </div>
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

