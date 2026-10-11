import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  IconeBusca,
  IconeCheck,
  IconeChevron,
  IconeFiltros,
} from '../components/icons';
import type { Equipamento, Unidade } from '../types';
import {
  formatarData,
  ROTULO_ESTADO,
  ROTULO_STATUS_EQUIPAMENTO,
} from '../utils/format';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

export function Inventario() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.perfil === 'GALPAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [ordenacao, setOrdenacao] = useState('');
  const [visualizacoesAberto, setVisualizacoesAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const requisicao = useRef(0);
  const inputCsv = useRef<HTMLInputElement>(null);
  const controles = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroUnidade) params.set('unidadeId', filtroUnidade);
    if (filtroStatus) params.set('status', filtroStatus);
    api
      .get<Equipamento[]>(`/equipamentos?${params}`)
      .then((dados) => {
        if (idRequisicao !== requisicao.current) return;
        setEquipamentos(dados);
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setEquipamentos([]);
        setErro(e.message);
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [busca, filtroUnidade, filtroStatus]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  useEffect(() => {
    api
      .get<Unidade[]>('/unidades')
      .then(setUnidades)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as unidades.'));
  }, []);

  // Mensagem de sucesso vinda do cadastro (página própria); limpa o state para
  // não reaparecer ao recarregar ou voltar para esta tela.

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
    try {
      const resultado = await api.post<{ importados: number; conflitos: string[] }>(
        '/importacao/csv',
        form,
      );
      window.alert(
        `Importação concluída: ${resultado.importados} equipamentos importados.` +
          (resultado.conflitos.length > 0
            ? ` Tombamentos ignorados por já existirem: ${resultado.conflitos.join(', ')}.`
            : ''),
      );
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na importação');
    }
  }

  const porPagina = 10;
  const equipamentosOrdenados = useMemo(() => {
    const lista = [...equipamentos];
    if (ordenacao === 'nome-asc') {
      lista.sort((a, b) => a.tipoEquipamento.nome.localeCompare(b.tipoEquipamento.nome, 'pt-BR'));
    } else if (ordenacao === 'tombamento-asc') {
      lista.sort((a, b) => a.tombamento.localeCompare(b.tombamento, 'pt-BR', { numeric: true }));
    } else if (ordenacao === 'aquisicao-desc') {
      lista.sort((a, b) => (b.dataAquisicao ?? '').localeCompare(a.dataAquisicao ?? ''));
    }
    return lista;
  }, [equipamentos, ordenacao]);
  const totalPaginas = Math.max(1, Math.ceil(equipamentosOrdenados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const equipamentosVisiveis = equipamentosOrdenados.slice(inicio, inicio + porPagina);
  const atalhosStatus = [
    { valor: '', rotulo: 'Todos', ariaLabel: 'Todos os bens' },
    {
      valor: 'ATIVO',
      rotulo: 'Ativos',
      ariaLabel: 'Ativos',
    },
    {
      valor: 'EM_MANUTENCAO',
      rotulo: 'Em manutenção',
      ariaLabel: 'Em manutenção',
    },
    {
      valor: 'BAIXADO',
      rotulo: 'Baixados',
      ariaLabel: 'Baixados',
    },
  ];
  const visualizacaoAtual = atalhosStatus.find((atalho) => atalho.valor === filtroStatus);
  const totalFiltros = Number(Boolean(filtroUnidade)) + Number(Boolean(filtroStatus && !visualizacaoAtual)) + Number(Boolean(ordenacao));

  return (
    <section className="gestao-page inventario-page" aria-labelledby="inventario-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="inventario-titulo">Inventário</h2>
        </div>
        {podeEditar && (
          <div className="inventario-lista-acoes">
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
              className="btn btn-outline inventario-importar"
              aria-label="Importar arquivo CSV"
              onClick={() => inputCsv.current?.click()}
            >
              Importar
            </button>
            <Link to="/inventario/novo" className="btn btn-primary">
              Novo equipamento
            </Link>
          </div>
        )}
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div
              className="inventario-consulta"
              role="search"
              aria-label="Pesquisar e filtrar inventário"
            >
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
                  {visualizacaoAtual?.rotulo ?? 'Personalizado'}
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div className="inventario-visualizacao-menu" role="menu" aria-label="Visualizações do inventário">
                    {atalhosStatus.map(({ valor, rotulo, ariaLabel }) => (
                      <button
                        key={valor}
                        type="button"
                        role="menuitemradio"
                        aria-label={ariaLabel}
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
                  aria-label="Buscar equipamentos"
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
            {usuario?.perfil !== 'UNIDADE' && (
              <label className="gestao-filtro-select">
                <span>Unidade</span>
                <select
                  aria-label="Filtrar por unidade"
                  value={filtroUnidade}
                  onChange={(e) => setFiltroUnidade(e.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="gestao-filtro-select inventario-status-extra">
              <span>Situação</span>
              <select
                aria-label="Filtrar por status"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="">Todas as situações</option>
                {Object.entries(ROTULO_STATUS_EQUIPAMENTO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </label>
            <label className="gestao-filtro-select">
              <span>Ordenar por</span>
              <select
                aria-label="Ordenar equipamentos"
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value)}
              >
                <option value="">Ordem padrão</option>
                <option value="nome-asc">Equipamento, A–Z</option>
                <option value="tombamento-asc">Tombamento crescente</option>
                <option value="aquisicao-desc">Aquisição mais recente</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => setFiltrosAbertos(false)}>Concluir</button>
            </div>
          )}
        </div>
        <div
          className="gestao-tabela-scroll"
          role="region"
          aria-label="Equipamentos"
          tabIndex={0}
          aria-busy={carregando}
        >
          <table>
            <caption className="gestao-sr-only">Bens patrimoniais da seleção atual</caption>
            <thead>
              <tr>
                <th scope="col">Tombamento</th>
                <th scope="col">Equipamento</th>
                <th scope="col">Unidade</th>
                <th scope="col">Status</th>
                <th scope="col">Conservação</th>
                <th scope="col">Aquisição</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={6} />}
              {!carregando &&
                !falhaCarregamento &&
                equipamentosVisiveis.map((eq) => (
                  <tr key={eq.id}>
                    <td><span className="inventario-tombamento">{eq.tombamento}</span></td>
                    <td className="gestao-equipamento">
                      <div className="inventario-equipamento-celula">
                        <div>
                          <Link
                            className="inventario-equipamento-link"
                            to={`/inventario/${eq.id}`}
                            aria-label={`Ver detalhes de ${eq.tombamento}`}
                          >
                            {eq.tipoEquipamento.nome}
                          </Link>
                          <div className="inventario-mobile-meta">
                            <span className="inventario-mobile-unidade">{eq.unidade.nome} · </span>
                            {ROTULO_ESTADO[eq.estadoConservacao]} · {formatarData(eq.dataAquisicao)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="inventario-unidade">
                      <strong>{eq.unidade.nome}</strong>
                      {eq.unidadeTemporaria && (
                        <div className="celula-equipamento-sub">
                          temporariamente em {eq.unidadeTemporaria.nome}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`inventario-status inventario-status--${eq.status}`}>
                        <span aria-hidden />
                        {ROTULO_STATUS_EQUIPAMENTO[eq.status]}
                      </span>
                    </td>
                    <td>
                      <span className={`inventario-conservacao inventario-conservacao--${eq.estadoConservacao}`}>
                        {ROTULO_ESTADO[eq.estadoConservacao]}
                      </span>
                    </td>
                    <td className="inventario-data">{formatarData(eq.dataAquisicao)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falhaCarregamento || equipamentos.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falhaCarregamento
                  ? 'Não foi possível carregar o inventário.'
                  : 'Nenhum equipamento encontrado'}
            </span>
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                (busca || filtroUnidade || filtroStatus || ordenacao) && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltroUnidade('');
                      setFiltroStatus('');
                      setOrdenacao('');
                    }}
                  >
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
              'Inventário indisponível'
            ) : (
              <>
                <strong>
                  {equipamentos.length} equipamento{equipamentos.length === 1 ? '' : 's'}
                </strong>
                {equipamentos.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–{Math.min(inicio + porPagina, equipamentos.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label="Paginação do inventário">
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
