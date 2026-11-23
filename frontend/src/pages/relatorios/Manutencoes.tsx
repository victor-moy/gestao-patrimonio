import '../Relatorios.css';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { StatusPill } from '../../components/StatusPill';
import { IconeBusca } from '../../components/icons';
import { FiltrosGerais, paramsFiltros, useOpcoesFiltro } from './filtros';
import { useCategoriasCivis } from '../../hooks/useCategoriasCivis';
import type { EtapaManutencao, ManutencaoRelatorio, PrestadorServico, RelatorioManutencoes, Setor, SituacaoManutencao } from '../../types';
import { capitalizarPalavras, codigoManutencao, formatarMoeda, ROTULO_STATUS_MANUTENCAO, statusManutencaoExibido } from '../../utils/format';

// Etapas do painel gerencial, na ordem em que o chamado percorre o fluxo
const ETAPAS: Array<{ chave: EtapaManutencao; rotulo: string }> = [
  { chave: 'aguardandoTriagem', rotulo: 'Aguardando triagem' },
  { chave: 'aguardandoAvaliacao', rotulo: 'Aguardando avaliação técnica' },
  { chave: 'aguardandoLiberacao', rotulo: 'Avaliado, a liberar' },
  { chave: 'noPrestador', rotulo: 'Com o prestador' },
  { chave: 'emRota', rotulo: 'Em rota' },
  { chave: 'emExecucao', rotulo: 'Em execução' },
  { chave: 'executados', rotulo: 'Executados' },
  { chave: 'aguardandoMedicao', rotulo: 'Aguardando medição' },
  { chave: 'parados', rotulo: 'Parados' },
];

// Fora do filtro: pseudo-status só de exibição
const OPCOES_STATUS = Object.entries(ROTULO_STATUS_MANUTENCAO).filter(([valor]) => valor !== 'CONTESTADO');

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

// Tabela de totais (manutenções e custo) por unidade ou por prestador
function TabelaTotais({
  titulo,
  coluna,
  linhas,
  carregado,
}: {
  titulo: string;
  coluna: string;
  linhas: Array<{ chave: string; nome: string; quantidade: number; custo: number }>;
  carregado: boolean;
}) {
  return (
    <div className="card rel-tabela rel-tabela--prestadores">
      <div className="rel-cabecalho rel-cabecalho--tabela">
        <h3>{titulo}</h3>
      </div>
      {linhas.length > 0 ? (
        <div className="rel-tabela-scroll rel-cartoes rel-cartoes--prestadores">
          <table>
            <thead>
              <tr>
                <th scope="col">{coluna}</th>
                <th scope="col" className="rel-coluna-num">Manutenções</th>
                <th scope="col" className="rel-coluna-num">Custo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave}>
                  <td className="rc-principal rel-tabela-principal">{l.nome}</td>
                  <td className="rc-a rel-coluna-num" data-label="Manutenções">{l.quantidade}</td>
                  <td className="rc-b rel-coluna-num" data-label="Custo">{formatarMoeda(l.custo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">{carregado ? 'Sem manutenções para os filtros selecionados' : 'Carregando…'}</div>
      )}
    </div>
  );
}

// Painel gerencial de manutenção, um para o chamado civil e outro para o de equipamento: fila por etapa, situação,
// custo, prazo, unidades, prestadores e o que mais gera chamado.
export function RelatorioManutencoes({ tipo }: { tipo: 'CIVIL' | 'EQUIPAMENTO' }) {
  const civil = tipo === 'CIVIL';
  const [dados, setDados] = useState<RelatorioManutencoes | null>(null);
  const { unidades, categorias, erro: erroOpcoes } = useOpcoesFiltro();
  const [prestadores, setPrestadores] = useState<PrestadorServico[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const { categorias: categoriasCivis } = useCategoriasCivis(civil);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    unidadeIds: [] as string[],
    tipoEquipamentoId: '',
    prestadorId: '',
    situacao: '' as '' | SituacaoManutencao,
    status: '',
    setorId: '',
    categoriaCivilId: '',
    busca: '',
  });

  useEffect(() => {
    api
      .get<PrestadorServico[]>('/prestadores')
      .then(setPrestadores)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os prestadores.'));
  }, []);

  useEffect(() => {
    if (!civil) return;
    api
      .get<Setor[]>('/setores')
      .then((l) => setSetores(Array.isArray(l) ? l : []))
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os setores.'));
  }, [civil]);

  const carregar = useCallback(() => {
    const params = paramsFiltros(filtros);
    params.set('tipoManutencao', tipo);
    if (filtros.status) params.set('status', filtros.status);
    if (civil && filtros.setorId) params.set('setorId', filtros.setorId);
    if (civil && filtros.categoriaCivilId) params.set('categoriaCivilId', filtros.categoriaCivilId);
    if (filtros.prestadorId) params.set('prestadorId', filtros.prestadorId);
    if (filtros.situacao) params.set('situacao', filtros.situacao);
    setErro(null);
    api
      .get<RelatorioManutencoes>(`/relatorios/manutencoes?${params}`)
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.'));
  }, [filtros, tipo, civil]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const percentual = (valor: number | undefined) =>
    dados && valor && dados.total > 0 ? Math.round((valor / dados.total) * 100) : 0;
  // Desfecho dos chamados que já saíram da fila
  const desfecho = [
    { rotulo: 'Concluídas', valor: dados?.concluidas },
    { rotulo: 'Negadas', valor: dados?.negadas },
    { rotulo: 'Baixadas', valor: dados?.baixadas },
  ];
  const maxEtapa = Math.max(1, ...ETAPAS.map((e) => dados?.etapas[e.chave] ?? 0));
  const meses = (dados?.porMes ?? []).slice(-MESES_NO_GRAFICO);
  const maxCusto = Math.max(1, ...meses.map((m) => m.custo));
  const itens = (dados?.porItem ?? []).slice(0, ITENS_NO_RANKING);
  const maxItem = Math.max(1, ...itens.map((i) => i.quantidade));

  // Painel civil: o Setor ocupa o lugar do Item na primeira linha de filtros
  const campoSetor = (
    <div>
      <span className="campo-rotulo">Setor</span>
      <select aria-label="Setor" value={filtros.setorId} onChange={(e) => setFiltros({ ...filtros, setorId: e.target.value })}>
        <option value="">Todos</option>
        {setores
          .filter((x) => filtros.unidadeIds.length === 0 || filtros.unidadeIds.includes(x.unidadeId))
          .map((x) => (
            <option key={x.id} value={x.id}>
              {filtros.unidadeIds.length === 1 ? x.nome : `${x.nome} · ${x.unidade.nome}`}
            </option>
          ))}
      </select>
    </div>
  );

  return (
    <>
      {(erro ?? erroOpcoes) && (
        <div className="error-banner" role="alert">
          {erro ?? erroOpcoes}
        </div>
      )}
      <div className="card card-pad rel-filtros">
        <FiltrosGerais filtros={filtros} onChange={setFiltros} unidades={unidades} categorias={categorias} semItem={civil} extra={campoSetor} />
        <div className={`relatorios-filtros-gerais rel-filtros-extra${civil ? '' : ' rel-filtros-extra--quatro'}`}>
          {civil && (
            <div>
              <span className="campo-rotulo">Tipo de problema</span>
              <select
                aria-label="Tipo de problema"
                value={filtros.categoriaCivilId}
                onChange={(e) => setFiltros({ ...filtros, categoriaCivilId: e.target.value })}
              >
                <option value="">Todos</option>
                {categoriasCivis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <span className="campo-rotulo">Status</span>
            <select
              aria-label="Status"
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
            >
              <option value="">Todos</option>
              {OPCOES_STATUS.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
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
          <div className={civil ? 'rel-filtro-largo' : undefined}>
            <span className="campo-rotulo">Busca</span>
            <label className="rel-busca rel-busca--campo">
              <IconeBusca />
              <input
                type="text"
                aria-label="Buscar manutenções"
                placeholder={civil ? 'Número, local ou descrição' : 'Número, tombamento ou descrição'}
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

      <div className="stats-grid rel-kpis rel-kpis--quatro">
        <div className="card stat-card">
          <div className="stat-label">Total de manutenções</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.total ?? '—'}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Em andamento</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.emAndamento ?? '—'}</span>
            <span className="stat-sub">{percentual(dados?.emAndamento)}%</span>
          </div>
          <div className="stat-trilho" aria-hidden>
            <div className="stat-trilho-fill stat-trilho-fill--andamento" style={{ width: `${percentual(dados?.emAndamento)}%` }} />
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Custo total</div>
          <div className="stat-linha">
            <span className="stat-value">{dados ? formatarMoeda(dados.custoTotal) : '—'}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Tempo médio de conclusão</div>
          <div className="stat-linha">
            <span className="stat-value">
              {dados ? (dados.tempoMedioDias === null ? '—' : `${String(dados.tempoMedioDias).replace('.', ',')} dias`) : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="rel-painel-topo">
        <section aria-label="Fila por etapa" className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>Fila por etapa</h3>
          </div>
          <ol className="rel-itens-lista rel-etapas-lista">
            {ETAPAS.map((e) => {
              const quantidade = dados?.etapas[e.chave];
              return (
                <li key={e.chave}>
                  <div className="rel-itens-linha">
                    <span className="rel-itens-nome">{e.rotulo}</span>
                    <span className="rel-itens-qtd">{quantidade ?? '—'}</span>
                  </div>
                  <div className="rel-itens-trilho" aria-hidden>
                    <div className="rel-itens-fill" style={{ width: `${((quantidade ?? 0) / maxEtapa) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-label="Desfecho" className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>Desfecho</h3>
          </div>
          <dl className="rel-resumo-lista">
            {desfecho.map((d) => (
              <div key={d.rotulo}>
                <dt>{d.rotulo}</dt>
                <dd>
                  {d.valor ?? '—'} <span>{percentual(d.valor)}%</span>
                </dd>
              </div>
            ))}
            {!civil && (
              <div>
                <dt>Manutenção não sugerida</dt>
                <dd>
                  {dados?.orcamentosAltos ?? '—'} <span>{percentual(dados?.orcamentosAltos)}%</span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <div className="relatorios-graficos rel-graficos-manutencao">
        <div className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>Custo por mês</h3>
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


        <div className="card card-pad rel-grafico-cartao">
          <div className="rel-cabecalho">
            <h3>{civil ? 'Tipos de problema com mais chamados' : 'Itens com mais manutenções'}</h3>
          </div>
          {dados ? (
            itens.length > 0 ? (
              <ol className="rel-itens-lista">
                {itens.map((item) => (
                  <li key={item.tipoEquipamentoId}>
                    <div className="rel-itens-linha">
                      <span className="rel-itens-nome" title={item.nome}>
                        {capitalizarPalavras(civil ? item.nome.replace(/^Civil · /, '') : item.nome)}
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

      <div className="relatorios-graficos rel-graficos-manutencao">
        <TabelaTotais
          titulo="Unidades"
          coluna="Unidade"
          carregado={Boolean(dados)}
          linhas={(dados?.porUnidade ?? []).map((u) => ({ chave: u.unidadeId, nome: u.unidade, quantidade: u.quantidade, custo: u.custo }))}
        />
        <TabelaTotais
          titulo="Prestadores"
          coluna="Prestador"
          carregado={Boolean(dados)}
          linhas={(dados?.porPrestador ?? []).map((p) => ({ chave: p.prestadorId, nome: p.prestador, quantidade: p.quantidade, custo: p.custo }))}
        />
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
                  <th scope="col">{civil ? 'Local' : 'Item'}</th>
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
                    <td className="rc-equip" data-label={civil ? 'Local' : 'Item'}>
                      {m.equipamento}
                      {civil && m.categoria && <div className="rel-tabela-sub">{m.categoria}</div>}
                      {m.tombamento && <div className="rel-tabela-sub">{m.tombamento}</div>}
                    </td>
                    <td className="rc-a" data-label="Unidade">{m.unidade}</td>
                    <td className="rc-b" data-label="Prestador">{m.prestador ?? '—'}</td>
                    <td className="rc-c rel-coluna-num" data-label="Orçamento">{m.orcamento === null ? '—' : formatarMoeda(m.orcamento)}</td>
                    <td className="rc-d rel-coluna-num" data-label="Custo final">{m.custoFinal === null ? '—' : formatarMoeda(m.custoFinal)}</td>
                    <td className="rc-status">
                      <div className="rel-tabela-status">
                        <StatusPill valor={statusManutencaoExibido(m).valor}>{statusManutencaoExibido(m).texto}</StatusPill>
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
