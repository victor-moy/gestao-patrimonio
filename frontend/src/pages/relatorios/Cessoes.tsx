import '../Relatorios.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { corDoStatus } from '../../components/Badge';
import { IconeBusca } from '../../components/icons';
import { SelectTipoEquipamento } from '../../components/SelectItem';
import { FiltroPeriodo, FiltroUnidade, useOpcoesFiltro } from './filtros';
import type { CessaoRelatorio, RelatorioCessoes } from '../../types';
import { formatarData, formatarMoeda, ROTULO_STATUS_SOLICITACAO } from '../../utils/format';

// Relatório 3 — prestação de contas de Cessão de Uso.
export function RelatorioCessoes() {
  const [dados, setDados] = useState<RelatorioCessoes | null>(null);
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
      .get<RelatorioCessoes>(`/relatorios/cessoes?${params}`)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const percentualCessoes = (valor: number | undefined) =>
    dados && dados.total > 0 && valor ? Math.round((valor / dados.total) * 100) : 0;
  const kpis = [
    { rotulo: 'Aguardando Branet', valor: dados?.aguardandoBranet, classe: 'andamento' },
    { rotulo: 'Concluídas', valor: dados?.concluida, classe: 'concluida' },
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
            aria-label="Buscar cessões"
            placeholder="Buscar por patrimônio, entidade ou item"
            value={filtros.busca}
            onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
          />
        </label>
      </div>

      <div className="stats-grid rel-kpis">
        <div className="card stat-card">
          <div className="stat-label">Total de cessões</div>
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
              <span className="stat-sub">{percentualCessoes(k.valor)}%</span>
            </div>
            <div className="stat-trilho" aria-hidden>
              <div
                className={`stat-trilho-fill stat-trilho-fill--${k.classe}`}
                style={{ width: `${percentualCessoes(k.valor)}%` }}
              />
            </div>
          </div>
        ))}
        <div className="card stat-card">
          <div className="stat-label">Valor total cedido</div>
          <div className="stat-linha">
            <span className="stat-value">{formatarMoeda(dados?.valorTotal ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="card rel-tabela">
        <div className="rel-cabecalho rel-cabecalho--tabela">
          <h3>Cessões de uso</h3>
        </div>
        {dados && dados.itens.length > 0 ? (
          <div className="rel-tabela-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Entidade externa</th>
                  <th scope="col">Equipamento</th>
                  <th scope="col">Unidade de origem</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Pedido Branet</th>
                  <th scope="col">Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((c: CessaoRelatorio) => (
                  <tr key={c.id}>
                    <td className="rel-tabela-principal">{c.entidadeExternaNome ?? '—'}</td>
                    <td>
                      <div>{c.tipoEquipamento ?? '—'}</div>
                      {c.numerosPatrimonio.length > 0 && (
                        <div className="rel-tabela-sub">Patrimônio {c.numerosPatrimonio.join(', ')}</div>
                      )}
                    </td>
                    <td>{c.unidadeOrigem}</td>
                    <td>{c.preco === null ? '—' : formatarMoeda(c.preco)}</td>
                    <td>
                      <span className={`inventario-status inventario-status--tom-${corDoStatus(c.status)}`}>
                        <span aria-hidden />
                        {ROTULO_STATUS_SOLICITACAO[c.status]}
                      </span>
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

