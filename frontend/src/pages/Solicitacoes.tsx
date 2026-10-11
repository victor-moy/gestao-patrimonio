import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import {
  IconeBusca,
  IconeCheck,
  IconeChevron,
  IconeFiltros,
} from '../components/icons';
import './Solicitacoes.css';
import { nomeItem, statusExibido } from '../utils/solicitacao';
import type { Solicitacao } from '../types';
import {
  formatarData,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
  codigoSolicitacao,
} from '../utils/format';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

// Pseudo-status calculados por statusExibido() que não existem como valor
// de status no banco — precisam de opção própria no filtro (senão o usuário
// vê o badge na lista mas não consegue filtrar por ele) e de um status real
// equivalente pra mandar de fato pro backend (feedback do cliente 27/08).
const OPCOES_STATUS_EXTRA: Array<{ valor: string; texto: string; statusBackend: string }> = [
  {
    valor: 'DISPONIVEL_PARA_RESERVA',
    texto: 'Disponível para Reserva',
    statusBackend: 'AGUARDANDO_DISPONIBILIDADE',
  },
  {
    valor: 'AGUARDANDO_RECOLHA_PATRIMONIO',
    texto: 'Aguardando Recolha (Patrimônio)',
    statusBackend: 'AGUARDANDO_ENTREGA',
  },
  {
    valor: 'AGUARDANDO_RECOLHA_BRANET',
    texto: 'Aguardando Recolha (Branet)',
    statusBackend: 'AGUARDANDO_ENTREGA',
  },
];

// Cada tipo só passa por um subconjunto dos status — quando o filtro de tipo
// está ativo, o de status esconde o resto pra não oferecer uma combinação
// que nunca acontece na prática (feedback do cliente 27/08, mesmo espírito
// da limpeza de status mortos de 20/08).
const STATUS_POR_TIPO: Record<string, string[]> = {
  AMPLIACAO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'RESERVADO',
    'AGUARDANDO_DISPONIBILIDADE',
    'DISPONIVEL_PARA_RESERVA',
    'AGUARDANDO_ENTREGA',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
  SUBSTITUICAO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'RESERVADO',
    'AGUARDANDO_DISPONIBILIDADE',
    'DISPONIVEL_PARA_RESERVA',
    'AGUARDANDO_ENTREGA',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
  // Cessão de Uso não passa mais por aprovação — só o Gestor abre, reserva
  // do estoque na hora (já nasce RESERVADO) e conclui ao lançar no Branet.
  CESSAO_USO: ['RESERVADO', 'CONCLUIDA'],
  EMPRESTIMO: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'AGUARDANDO_SAIDA',
    'AGUARDANDO_RETORNO',
    'CONCLUIDA',
  ],
  RECOLHA: [
    'PENDENTE_APROVACAO',
    'NEGADA',
    'EXPIRADA',
    'AGUARDANDO_RECOLHA_PATRIMONIO',
    'AGUARDANDO_RECOLHA_BRANET',
    'AGUARDANDO_VALIDACAO',
    'CONCLUIDA',
  ],
};

export function Solicitacoes() {
  const { usuario } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [visualizacoesAberto, setVisualizacoesAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const controles = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);

  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroTipo) params.set('tipo', filtroTipo);
    if (filtroStatus) {
      const extra = OPCOES_STATUS_EXTRA.find((o) => o.valor === filtroStatus);
      params.set('status', extra?.statusBackend ?? filtroStatus);
    }
    api
      .get<Solicitacao[]>(`/solicitacoes?${params}`)
      .then((dados) => {
        if (idRequisicao !== requisicao.current) return;
        setSolicitacoes(dados);
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setErro(e.message);
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [busca, filtroTipo, filtroStatus]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  // Fecha os menus da barra ao clicar fora ou apertar Escape
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


  // O backend filtra pelo status real (ex: AGUARDANDO_ENTREGA), mas quando o
  // filtro escolhido é um pseudo-status (ex: "Aguardando Recolha (Branet)")
  // ainda falta refinar no cliente pra bater exatamente com o badge exibido
  const solicitacoesExibidas = OPCOES_STATUS_EXTRA.some((o) => o.valor === filtroStatus)
    ? solicitacoes.filter((s) => statusExibido(s).valor === filtroStatus)
    : solicitacoes;

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(solicitacoesExibidas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  function selecionarTipo(tipo: string) {
    setFiltroTipo(tipo);
    if (tipo && filtroStatus && !STATUS_POR_TIPO[tipo]?.includes(filtroStatus)) {
      setFiltroStatus('');
    }
  }

  const visualizacaoAtual = [['', 'Todas'], ...Object.entries(ROTULO_TIPO_SOLICITACAO)].find(
    ([valor]) => valor === filtroTipo,
  );
  const totalFiltros = Number(Boolean(filtroStatus));
  const podeCriar = usuario?.perfil === 'UNIDADE' || usuario?.perfil === 'GESTOR_PATRIMONIO';

  return (
    <section
      className="gestao-page inventario-page solicitacoes-page"
      aria-labelledby="solicitacoes-titulo"
    >
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="solicitacoes-titulo">Solicitações</h2>
        </div>
        {podeCriar && (
          <div className="inventario-lista-acoes">
            <Link to="/solicitacoes/nova" className="btn btn-primary">
              Nova solicitação
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
              aria-label="Pesquisar e filtrar solicitações"
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
                  {visualizacaoAtual?.[1] ?? 'Todas'}
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div
                    className="inventario-visualizacao-menu"
                    role="menu"
                    aria-label="Visualizações das solicitações"
                  >
                    {[['', 'Todas'], ...Object.entries(ROTULO_TIPO_SOLICITACAO)].map(
                      ([valor, rotulo]) => (
                        <button
                          key={valor}
                          type="button"
                          role="menuitemradio"
                          aria-checked={filtroTipo === valor}
                          onClick={() => {
                            selecionarTipo(valor);
                            setVisualizacoesAberto(false);
                          }}
                        >
                          <span className="inventario-visualizacao-check" aria-hidden>
                            {filtroTipo === valor && <IconeCheck />}
                          </span>
                          <span>{rotulo}</span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <div className="inventario-consulta-busca">
                <IconeBusca />
                <input
                  aria-label="Buscar solicitações"
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <button
                type="button"
                className={`inventario-filtros-botao${totalFiltros > 0 ? ' ativo' : ''}`}
                aria-label="Filtrar"
                title="Filtrar"
                aria-expanded={filtrosAbertos}
                onClick={() => {
                  setFiltrosAbertos((aberto) => !aberto);
                  setVisualizacoesAberto(false);
                }}
              >
                <IconeFiltros />
                {totalFiltros > 0 && (
                  <span aria-label={`${totalFiltros} filtros aplicados`}>{totalFiltros}</span>
                )}
              </button>
            </div>
          </div>
          {filtrosAbertos && (
            <div className="inventario-filtros-popover">
              <label className="gestao-filtro-select">
                <span>Status</span>
                <select
                  aria-label="Filtrar por status"
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="">Todos os status</option>
                  {Object.entries(ROTULO_STATUS_SOLICITACAO)
                    .filter(([valor]) => !filtroTipo || STATUS_POR_TIPO[filtroTipo]?.includes(valor))
                    .map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  {OPCOES_STATUS_EXTRA.filter(
                    ({ valor }) => !filtroTipo || STATUS_POR_TIPO[filtroTipo]?.includes(valor),
                  ).map(({ valor, texto }) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-primary" onClick={() => setFiltrosAbertos(false)}>
                Concluir
              </button>
            </div>
          )}
        </div>
        <div
          className="gestao-tabela-scroll"
          role="region"
          aria-label="Solicitações"
          tabIndex={0}
          aria-busy={carregando}
        >
          <table>
            <caption className="gestao-sr-only">Solicitações da seleção atual</caption>
            <thead>
              <tr>
                <th scope="col">Solicitação</th>
                <th scope="col">Tipo</th>
                <th scope="col">Unidade</th>
                <th scope="col">Status</th>
                <th scope="col">Solicitado em</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={5} />}
              {!carregando &&
                !falhaCarregamento &&
                solicitacoesExibidas.slice(inicio, inicio + porPagina).map((s) => (
                  <tr key={s.id}>
                    <td className="gestao-equipamento">
                      <span className="req-numero">{codigoSolicitacao(s.numero)}</span>
                      <Link
                        className="inventario-equipamento-link"
                        to={`/solicitacoes/${s.id}`}
                        aria-label={`Ver solicitação de ${nomeItem(s)}`}
                      >
                        {nomeItem(s)}
                      </Link>
                      <div className="inventario-mobile-meta">
                        <span className="inventario-mobile-unidade">{s.unidadeOrigem.nome} · </span>
                        {formatarData(s.criadoEm)}
                      </div>
                    </td>
                    <td>
                      <span className="inventario-data">{ROTULO_TIPO_SOLICITACAO[s.tipo]}</span>
                      {s.origemRecurso === 'EMENDA_PARLAMENTAR' && (
                        <span className="badge badge-purple solicitacoes-selo">Emenda</span>
                      )}
                      {s.automatica && <span className="badge badge-gray solicitacoes-selo">Automática</span>}
                    </td>
                    <td className="inventario-unidade">
                      <strong>{s.unidadeOrigem.nome}</strong>
                    </td>
                    <td>
                      <Badge valor={statusExibido(s).valor}>{statusExibido(s).texto}</Badge>
                    </td>
                    <td className="inventario-data">{formatarData(s.criadoEm)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falhaCarregamento || solicitacoesExibidas.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falhaCarregamento
                  ? 'Não foi possível carregar as solicitações.'
                  : 'Nenhuma solicitação encontrada'}
            </span>
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                (busca || filtroTipo || filtroStatus) && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltroTipo('');
                      setFiltroStatus('');
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
              'Solicitações indisponíveis'
            ) : (
              <>
                <strong>
                  {solicitacoesExibidas.length} solicitaç
                  {solicitacoesExibidas.length === 1 ? 'ão' : 'ões'}
                </strong>
                {solicitacoesExibidas.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–
                    {Math.min(inicio + porPagina, solicitacoesExibidas.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label="Paginação das solicitações">
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
