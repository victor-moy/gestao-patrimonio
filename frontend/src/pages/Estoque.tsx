import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { IconeBusca, IconeCheck, IconeChevron, IconeFiltros } from '../components/icons';
import type { EstoqueItem, Unidade } from '../types';
import { capitalizarPalavras } from '../utils/format';
import './Estoque.css';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

interface ResultadoImportacaoEstoque {
  totalLinhas: number;
  itensUnicos: number;
  tiposCriados: number;
  itensAtualizados: number;
  ajustes: number;
  duplicados: string[];
}

type StatusItem = 'OK' | 'BAIXO' | 'ESGOTADO';
type Ordenacao = '' | 'qtd_asc' | 'qtd_desc';

const POR_PAGINA = 10;

function statusDoItem(qtd: number): StatusItem {
  if (qtd === 0) return 'ESGOTADO';
  if (qtd <= 3) return 'BAIXO';
  return 'OK';
}

const ROTULO_STATUS: Record<StatusItem, string> = {
  OK: 'Estoque coberto',
  BAIXO: 'Estoque baixo',
  ESGOTADO: 'Estoque zero',
};

const TOM_STATUS: Record<StatusItem, string> = { OK: 'green', BAIXO: 'yellow', ESGOTADO: 'red' };

const VISUALIZACOES: Array<{ valor: '' | StatusItem; rotulo: string }> = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'OK', rotulo: 'Coberto' },
  { valor: 'BAIXO', rotulo: 'Baixo' },
  { valor: 'ESGOTADO', rotulo: 'Zero' },
];

export function Estoque() {
  const location = useLocation();
  const navigate = useNavigate();
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [galpoes, setGalpoes] = useState<Unidade[]>([]);
  const [galpaoId, setGalpaoId] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusItem>('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('');
  const [pagina, setPagina] = useState(1);
  const [visualizacoesAberto, setVisualizacoesAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);
  const inputCsv = useRef<HTMLInputElement>(null);
  const controles = useRef<HTMLDivElement>(null);
  const requisicao = useRef(0);

  // Volta de uma movimentação (página própria): mantém o galpão em que ela foi feita
  useEffect(() => {
    const estado = location.state as { galpaoId?: string } | null;
    if (!estado?.galpaoId) return;
    setGalpaoId(estado.galpaoId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  useEffect(() => {
    api
      .get<Unidade[]>('/unidades')
      .then((us) => {
        const soGalpoes = us.filter((u) => u.tipo === 'GALPAO');
        setGalpoes(soGalpoes);
        setGalpaoId((atual) => atual || soGalpoes[0]?.id || '');
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os galpões.'));
  }, []);

  const carregar = useCallback(() => {
    if (!galpaoId) return;
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    api
      .get<EstoqueItem[]>(`/estoque?unidadeId=${galpaoId}`)
      .then((dados) => {
        if (idRequisicao === requisicao.current) setItens(dados);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setItens([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar o estoque.');
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [galpaoId]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  useEffect(() => {
    function fecharMenus(evento: PointerEvent | KeyboardEvent) {
      if (evento instanceof KeyboardEvent) {
        if (evento.key !== 'Escape') return;
      } else if (controles.current?.contains(evento.target as Node)) {
        return;
      }
      setVisualizacoesAberto(false);
      setFiltrosAbertos(false);
    }
    document.addEventListener('pointerdown', fecharMenus);
    document.addEventListener('keydown', fecharMenus);
    return () => {
      document.removeEventListener('pointerdown', fecharMenus);
      document.removeEventListener('keydown', fecharMenus);
    };
  }, []);

  async function importarCsv(arquivo: File) {
    setErro(null);
    const form = new FormData();
    form.append('arquivo', arquivo);
    form.append('unidadeId', galpaoId);
    try {
      const r = await api.post<ResultadoImportacaoEstoque>('/estoque/importar-csv', form);
      window.alert(
        `Importação concluída: ${r.itensUnicos} itens processados` +
          `${r.tiposCriados > 0 ? `, ${r.tiposCriados} novos cadastrados` : ''}` +
          `${r.ajustes > 0 ? `, ${r.ajustes} com ajuste de saldo` : ''}.` +
          (r.duplicados.length > 0
            ? ` Códigos duplicados no arquivo (usada a última ocorrência): ${r.duplicados.join(', ')}.`
            : ''),
      );
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na importação');
    }
  }

  const categoriasDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(itens.map((i) => i.tipoEquipamento.categoria?.nome).filter((n): n is string => !!n)),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens],
  );

  const filtradosOrdenados = useMemo(() => {
    const alvo = busca.toLowerCase();
    const filtrados = itens.filter((i) => {
      const buscaOk =
        !alvo ||
        i.tipoEquipamento.nome.toLowerCase().includes(alvo) ||
        i.tipoEquipamento.codigo.toLowerCase().includes(alvo) ||
        (i.tipoEquipamento.categoria?.nome.toLowerCase().includes(alvo) ?? false);
      const categoriaOk = !filtroCategoria || i.tipoEquipamento.categoria?.nome === filtroCategoria;
      const statusOk = !filtroStatus || statusDoItem(i.quantidade) === filtroStatus;
      return buscaOk && categoriaOk && statusOk;
    });
    return [...filtrados].sort((a, b) => {
      if (ordenacao === 'qtd_asc') return a.quantidade - b.quantidade;
      if (ordenacao === 'qtd_desc') return b.quantidade - a.quantidade;
      return a.tipoEquipamento.nome.localeCompare(b.tipoEquipamento.nome, 'pt-BR');
    });
  }, [itens, busca, filtroCategoria, filtroStatus, ordenacao]);

  // Sempre que busca ou filtros mudam, volta para a primeira página
  useEffect(() => {
    setPagina(1);
  }, [busca, filtroCategoria, filtroStatus, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(filtradosOrdenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const itensDaPagina = filtradosOrdenados.slice(inicio, inicio + POR_PAGINA);
  const visualizacaoAtual = VISUALIZACOES.find((v) => v.valor === filtroStatus);
  const totalFiltros = Number(Boolean(filtroCategoria)) + Number(Boolean(ordenacao));
  const movimentarPara = (tipoId?: string) =>
    `/estoque/movimentar?galpao=${galpaoId}${tipoId ? `&tipo=${tipoId}` : ''}`;

  function limparFiltros() {
    setBusca('');
    setFiltroCategoria('');
    setFiltroStatus('');
    setOrdenacao('');
  }

  return (
    <section className="gestao-page inventario-page estoque-page" aria-labelledby="estoque-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="estoque-titulo">Estoque</h2>
        </div>
        <div className="inventario-lista-acoes">
          <select
            className="estoque-galpao"
            value={galpaoId}
            onChange={(e) => setGalpaoId(e.target.value)}
            aria-label="Galpão"
          >
            {galpoes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          <input
            ref={inputCsv}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) importarCsv(arquivo);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-outline"
            aria-label="Importar arquivo CSV"
            disabled={!galpaoId}
            onClick={() => inputCsv.current?.click()}
          >
            Importar
          </button>
          <Link
            to={movimentarPara()}
            className="btn btn-primary"
            aria-disabled={!galpaoId}
          >
            Movimentar
          </Link>
        </div>
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div className="inventario-consulta" role="search" aria-label="Pesquisar e filtrar estoque">
              <div className="inventario-visualizacao">
                <button
                  type="button"
                  className="inventario-visualizacao-botao"
                  aria-haspopup="menu"
                  aria-expanded={visualizacoesAberto}
                  onClick={() => {
                    setVisualizacoesAberto((aberto) => !aberto);
                    setFiltrosAbertos(false);
                  }}
                >
                  {visualizacaoAtual?.rotulo}
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div className="inventario-visualizacao-menu" role="menu" aria-label="Visualizações do estoque">
                    {VISUALIZACOES.map(({ valor, rotulo }) => (
                      <button
                        key={valor}
                        type="button"
                        role="menuitemradio"
                        aria-checked={filtroStatus === valor}
                        onClick={() => {
                          setFiltroStatus(valor);
                          setVisualizacoesAberto(false);
                        }}
                      >
                        <span className="inventario-visualizacao-check" aria-hidden>
                          {filtroStatus === valor && <IconeCheck />}
                        </span>
                        <span>{rotulo}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="inventario-consulta-busca">
                <IconeBusca />
                <input
                  aria-label="Buscar no estoque"
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`inventario-filtros-botao${totalFiltros > 0 ? ' ativo' : ''}`}
                aria-label="Filtrar e ordenar"
                title="Filtrar e ordenar"
                aria-expanded={filtrosAbertos}
                onClick={() => {
                  setFiltrosAbertos((aberto) => !aberto);
                  setVisualizacoesAberto(false);
                }}
              >
                <IconeFiltros />
                {totalFiltros > 0 && <span aria-label={`${totalFiltros} filtros aplicados`}>{totalFiltros}</span>}
              </button>
            </div>
          </div>
          {filtrosAbertos && (
            <div className="inventario-filtros-popover">
              <label className="gestao-filtro-select">
                <span>Categoria</span>
                <select
                  aria-label="Filtrar por categoria"
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                >
                  <option value="">Todas as categorias</option>
                  {categoriasDisponiveis.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="gestao-filtro-select">
                <span>Ordenar por</span>
                <select
                  aria-label="Ordenar estoque"
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                >
                  <option value="">Nome, A–Z</option>
                  <option value="qtd_asc">Menor quantidade</option>
                  <option value="qtd_desc">Maior quantidade</option>
                </select>
              </label>
              <button type="button" className="btn btn-primary" onClick={() => setFiltrosAbertos(false)}>
                Concluir
              </button>
            </div>
          )}
        </div>

        <div className="gestao-tabela-scroll" role="region" aria-label="Itens em estoque" tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">Itens em estoque do galpão selecionado</caption>
            <thead>
              <tr>
                <th scope="col">Equipamento</th>
                <th scope="col">Categoria</th>
                <th scope="col">Disponível</th>
                <th
                  scope="col"
                  title="Somado entre todos os galpões — a reserva não fica presa a um galpão específico"
                >
                  Reservado
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="gestao-sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={6} />}
              {!carregando &&
                !falhaCarregamento &&
                itensDaPagina.map((item) => {
                  const status = statusDoItem(item.quantidade);
                  const nome = capitalizarPalavras(item.tipoEquipamento.nome);
                  return (
                    <tr key={item.id}>
                      <td className="gestao-equipamento">
                        <span className="estoque-equipamento">{nome}</span>
                        <span className="estoque-codigo">#{item.tipoEquipamento.codigo}</span>
                        <div className="inventario-mobile-meta">
                          {item.tipoEquipamento.categoria?.nome ?? 'Sem categoria'} · {ROTULO_STATUS[status]}
                        </div>
                      </td>
                      <td className="inventario-data">{item.tipoEquipamento.categoria?.nome ?? '—'}</td>
                      <td className="inventario-data">{item.quantidade} un.</td>
                      <td className="inventario-data">{item.reservado > 0 ? `${item.reservado} un.` : '—'}</td>
                      <td>
                        <span className={`inventario-status inventario-status--tom-${TOM_STATUS[status]}`}>
                          <span aria-hidden />
                          {ROTULO_STATUS[status]}
                        </span>
                      </td>
                      <td className="estoque-acoes">
                        <Link
                          className="btn btn-outline"
                          to={movimentarPara(item.tipoEquipamento.id)}
                          aria-label={`Movimentar ${nome}`}
                        >
                          Movimentar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!carregando && (falhaCarregamento || filtradosOrdenados.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falhaCarregamento
                  ? 'Não foi possível carregar o estoque.'
                  : itens.length === 0
                    ? 'Nenhum item cadastrado no estoque'
                    : 'Nenhum item encontrado'}
            </span>
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                itens.length > 0 &&
                (busca || filtroCategoria || filtroStatus || ordenacao) && (
                  <button className="btn btn-primary inventario-vazio-acao" onClick={limparFiltros}>
                    Limpar filtros
                  </button>
                )
              ))}
          </div>
        )}
        <div className="gestao-rodape">
          <span role="status">
            {carregando ? (
              'Atualizando seleção…'
            ) : falhaCarregamento ? (
              'Estoque indisponível'
            ) : (
              <>
                <strong>
                  {filtradosOrdenados.length} equipamento{filtradosOrdenados.length === 1 ? '' : 's'}
                </strong>
                {filtradosOrdenados.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, filtradosOrdenados.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label="Paginação do estoque">
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === 1}
              onClick={() => setPagina(paginaAtual - 1)}
              aria-label="Página anterior"
            >
              Anterior
            </button>
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
              aria-label="Próxima página"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
