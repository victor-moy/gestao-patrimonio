import '../Relatorios.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { StatusPill } from '../../components/StatusPill';
import { IconeBusca } from '../../components/icons';
import { FiltrosGerais, paramsFiltros, useOpcoesFiltro } from './filtros';
import type { ManutencaoRelatorio, PrestadorServico, RelatorioManutencoes, SituacaoManutencao } from '../../types';
import { capitalizarPalavras, codigoManutencao, formatarMoeda, ROTULO_STATUS_MANUTENCAO } from '../../utils/format';

const SITUACOES: Array<{ valor: '' | SituacaoManutencao; rotulo: string }> = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'CONCLUIDA', rotulo: 'Concluídas' },
  { valor: 'NEGADA', rotulo: 'Negadas' },
  { valor: 'BAIXADO', rotulo: 'Baixadas' },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function rotuloMes(mes: string) {
  const [ano, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1]}/${ano.slice(2)}`;
}

const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${n === 1 ? singular : pluralTexto}`;

const MESES_NO_GRAFICO = 12;
const ITENS_NO_RANKING = 5;

// Relatório 7 — Manutenções: situação, custo, prazo, prestadores e itens que mais geram manutenção.
export function RelatorioManutencoes() {
  const [dados, setDados] = useState<RelatorioManutencoes | null>(null);
  const { unidades, categorias, erro: erroOpcoes } = useOpcoesFiltro();
  const [prestadores, setPrestadores] = useState<PrestadorServico[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeIds: [] as string[],
    tipoEquipamentoId: '',
    prestadorId: '',
    situacao: '' as '' | SituacaoManutencao,
    busca: '',
  });

  useEffect(() => {
    api
      .get<PrestadorServico[]>('/prestadores')
      .then(setPrestadores)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os prestadores.'));
  }, []);

  const carregar = useCallback(() => {
    const params = paramsFiltros(filtros);
    if (filtros.prestadorId) params.set('prestadorId', filtros.prestadorId);
    if (filtros.situacao) params.set('situacao', filtros.situacao);
    setErro(null);
    api
      .get<RelatorioManutencoes>(`/relatorios/manutencoes?${params}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'));
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const percentual = (valor: number | undefined) =>
    dados && valor && dados.total > 0 ? Math.round((valor / dados.total) * 100) : 0;
  const kpis = [
    { rotulo: 'Em andamento', valor: dados?.emAndamento, classe: 'andamento' },
    { rotulo: 'Concluídas', valor: dados?.concluidas, classe: 'concluida' },
    { rotulo: 'Negadas', valor: dados?.negadas, classe: 'negada' },
    { rotulo: 'Baixadas', valor: dados?.baixadas, classe: 'negada' },
  ];
  const meses = (dados?.porMes ?? []).slice(-MESES_NO_GRAFICO);
  const maxCusto = Math.max(1, ...meses.map((m) => m.custo));
  const itens = (dados?.porItem ?? []).slice(0, ITENS_NO_RANKING);
  const maxItem = Math.max(1, ...itens.map((i) => i.quantidade));

  return (
    <>
      {(erro ?? erroOpcoes) && (
        <div className="error-banner" role="alert">
          {erro ?? erroOpcoes}
        </div>
      )}
      <div className="card card-pad rel-filtros">
        <FiltrosGerais filtros={filtros} onChange={setFiltros} unidades={unidades} categorias={categorias} />
        <div className="relatorios-filtros-gerais rel-filtros-extra">
          <div>
            <span className="campo-rotulo">Prestador de serviço</span>
            <select
              aria-label="Prestador de serviço"
              value={filtros.prestadorId}
              onChange={(e) => setFiltros({ ...filtros, prestadorId: e.target.value })}
            >
              <option value="">Todos</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="campo-rotulo">Situação</span>
            <select
              aria-label="Situação"
              value={filtros.situacao}
              onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value as '' | SituacaoManutencao })}
            >
              {SITUACOES.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="campo-rotulo">Busca</span>
            <label className="rel-busca rel-busca--campo">
              <IconeBusca />
              <input
                type="text"
                aria-label="Buscar manutenções"
                placeholder="Número, tombamento ou descrição"
                value={filtros.busca}
                onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
              />
            </label>
          </div>
        </div>
      </div>

      {dados?.truncado && (
        <p className="rel-aviso" role="status">
          Os totais consideram as {dados.total} manutenções mais recentes. Restrinja o período para ver tudo.
        </p>
      )}

      <div className="stats-grid rel-kpis rel-kpis--cinco">
        <div className="card stat-card">
          <div className="stat-label">Total de manutenções</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.total ?? '—'}</span>
          </div>
        </div>
        {kpis.map((k) => (
          <div className="card stat-card" key={k.rotulo}>
            <div className="stat-label">
              <span className={`stat-dot stat-dot--${k.classe}`} aria-hidden /> {k.rotulo}
            </div>
            <div className="stat-linha">
              <span className="stat-value">{k.valor ?? '—'}</span>
              <span className="stat-sub">{percentual(k.valor)}%</span>
            </div>
            <div className="stat-trilho" aria-hidden>
              <div className={`stat-trilho-fill stat-trilho-fill--${k.classe}`} style={{ width: `${percentual(k.valor)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid rel-kpis rel-kpis--tres">
        <div className="card stat-card">
          <div className="stat-label">Custo total</div>
          <div className="stat-linha">
            <span className="stat-value">{dados ? formatarMoeda(dados.custoTotal) : '—'}</span>
          </div>
          <div className="stat-sub">Custo final, ou orçamento enquanto o reparo não termina</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Tempo médio de conclusão</div>
          <div className="stat-linha">
            <span className="stat-value">
              {dados ? (dados.tempoMedioDias === null ? '—' : `${String(dados.tempoMedioDias).replace('.', ',')} dias`) : '—'}
            </span>
          </div>
          <div className="stat-sub">Da abertura à conclusão, só as concluídas</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Manutenção não sugerida</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.orcamentosAltos ?? '—'}</span>
          </div>
          <div className="stat-sub">Orçamentos a partir de 50% do preço de referência do item</div>
        </div>
      </div>

      <div className="relatorios-graficos rel-graficos-manutencao">
        <div className="rel-coluna-pilha">
        <div className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>Custo por mês</h3>
            <p>Mês de abertura da manutenção{(dados?.porMes.length ?? 0) > MESES_NO_GRAFICO ? ` · últimos ${MESES_NO_GRAFICO} meses` : ''}</p>
          </div>
          {dados ? (
            meses.length > 0 ? (
              <ol className="rel-itens-lista" aria-label="Custo por mês">
                {meses.map((m) => (
                  <li key={m.mes}>
                    <div className="rel-itens-linha">
                      <span className="rel-itens-nome">{rotuloMes(m.mes)}</span>
                      <span className="rel-itens-qtd">{formatarMoeda(m.custo)}</span>
                    </div>
                    <div className="rel-itens-trilho" aria-hidden>
                      <div className="rel-itens-fill" style={{ width: `${(m.custo / maxCusto) * 100}%` }} />
                    </div>
                    <div className="rel-grafico-apoio">{plural(m.quantidade, 'manutenção', 'manutenções')}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">Sem manutenções para os filtros selecionados</div>
            )
          ) : (
            <div className="empty-state">Carregando…</div>
          )}
        </div>

        <div className="card rel-tabela rel-tabela--prestadores">
          <div className="rel-cabecalho rel-cabecalho--tabela">
            <h3>Prestadores</h3>
          </div>
          {dados && dados.porPrestador.length > 0 ? (
            <div className="rel-tabela-scroll rel-cartoes rel-cartoes--prestadores">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Prestador</th>
                    <th scope="col" className="rel-coluna-num">Manutenções</th>
                    <th scope="col" className="rel-coluna-num">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porPrestador.map((p) => (
                    <tr key={p.prestadorId}>
                      <td className="rc-principal rel-tabela-principal">{p.prestador}</td>
                      <td className="rc-a rel-coluna-num" data-label="Manutenções">{p.quantidade}</td>
                      <td className="rc-b rel-coluna-num" data-label="Custo">{formatarMoeda(p.custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">{dados ? 'Sem manutenções para os filtros selecionados' : 'Carregando…'}</div>
          )}
        </div>
        </div>

        <div className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>Itens com mais manutenções</h3>
            <p>Candidatos a reposição</p>
          </div>
          {dados ? (
            itens.length > 0 ? (
              <ol className="rel-itens-lista">
                {itens.map((item) => (
                  <li key={item.tipoEquipamentoId}>
                    <div className="rel-itens-linha">
                      <span className="rel-itens-nome" title={item.nome}>
                        {capitalizarPalavras(item.nome)}
                      </span>
                      <span className="rel-itens-qtd">{item.quantidade}</span>
                    </div>
                    <div className="rel-itens-trilho" aria-hidden>
                      <div className="rel-itens-fill" style={{ width: `${(item.quantidade / maxItem) * 100}%` }} />
                    </div>
                    <div className="rel-grafico-apoio">Custo {formatarMoeda(item.custo)}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">Sem manutenções para os filtros selecionados</div>
            )
          ) : (
            <div className="empty-state">Carregando…</div>
          )}
        </div>
      </div>

      <div className="card rel-tabela">
        <div className="rel-cabecalho rel-cabecalho--tabela">
          <h3>Manutenções</h3>
          {dados && dados.itensTotal > dados.itens.length && (
            <p>Mostrando as {dados.itens.length} mais recentes de {dados.itensTotal}</p>
          )}
        </div>
        {dados && dados.itens.length > 0 ? (
          <div className="rel-tabela-scroll rel-cartoes rel-cartoes--manutencoes">
            <table>
              <thead>
                <tr>
                  <th scope="col">Manutenção</th>
                  <th scope="col">Item</th>
                  <th scope="col">Unidade</th>
                  <th scope="col">Prestador</th>
                  <th scope="col" className="rel-coluna-num">Orçamento</th>
                  <th scope="col" className="rel-coluna-num">Custo final</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((m: ManutencaoRelatorio) => (
                  <tr key={m.id}>
                    <td className="rc-principal">
                      <span className="rel-numero">{codigoManutencao(m.numero)}</span>
                      <div className="rel-tabela-principal">{m.titulo?.trim() || m.equipamento}</div>
                    </td>
                    <td className="rc-equip" data-label="Item">
                      {m.equipamento}
                      {m.tombamento && <div className="rel-tabela-sub">{m.tombamento}</div>}
                    </td>
                    <td className="rc-a" data-label="Unidade">{m.unidade}</td>
                    <td className="rc-b" data-label="Prestador">{m.prestador ?? '—'}</td>
                    <td className="rc-c rel-coluna-num" data-label="Orçamento">{m.orcamento === null ? '—' : formatarMoeda(m.orcamento)}</td>
                    <td className="rc-d rel-coluna-num" data-label="Custo final">{m.custoFinal === null ? '—' : formatarMoeda(m.custoFinal)}</td>
                    <td className="rc-status">
                      <div className="rel-tabela-status">
                        <StatusPill valor={m.status}>{ROTULO_STATUS_MANUTENCAO[m.status]}</StatusPill>
                        {m.naoSugerida && <StatusPill valor="NAO_SUGERIDA">Não sugerida</StatusPill>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">{dados ? 'Sem manutenções para os filtros selecionados' : 'Carregando…'}</div>
        )}
      </div>
    </>
  );
}
