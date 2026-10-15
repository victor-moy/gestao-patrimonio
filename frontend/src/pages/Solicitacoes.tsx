import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/StatusPill';
import {
  IconeBusca,
  IconeCheck,
  IconeChevron,
  IconeFiltros,
} from '../components/icons';
import './Solicitacoes.css';
import { statusExibido, tituloSolicitacao } from '../utils/solicitacao';
import { tituloManutencao } from '../utils/manutencao';
import type { Manutencao, Solicitacao } from '../types';
import {
  codigoManutencao,
  formatarData,
  ROTULO_STATUS_MANUTENCAO,
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

// Manutenção aparece na lista como mais um tipo de solicitação, mas é outro registro (MAN-0001, rota própria)
const TIPO_MANUTENCAO = 'MANUTENCAO';
const TIPOS_DE_SOLICITACAO = Object.entries(ROTULO_TIPO_SOLICITACAO).filter(([valor]) => valor !== TIPO_MANUTENCAO);

// Statuses de manutenção que não existem em solicitação (o resto tem o mesmo valor e o mesmo rótulo)
const STATUS_SO_DE_MANUTENCAO = Object.entries(ROTULO_STATUS_MANUTENCAO).filter(
  ([valor]) => !(valor in ROTULO_STATUS_SOLICITACAO),
);

interface LinhaLista {
  chave: string;
  id: string;
  numero: string;
  titulo: string;
  tipo: string;
  tipoTexto: string;
  unidade: string;
  statusValor: string;
  statusTexto: string;
  criadoEm: string;
  para: string;
  rotuloLink: string;
  emenda: boolean;
  automatica: boolean;
}

const daSolicitacao = (s: Solicitacao): LinhaLista => ({
  chave: `s-${s.id}`,
  id: s.id,
  numero: codigoSolicitacao(s.numero),
  titulo: tituloSolicitacao(s),
  tipo: s.tipo,
  tipoTexto: ROTULO_TIPO_SOLICITACAO[s.tipo],
  unidade: s.unidadeOrigem.nome,
  statusValor: statusExibido(s).valor,
  statusTexto: statusExibido(s).texto,
  criadoEm: s.criadoEm,
  para: `/solicitacoes/${s.id}`,
  rotuloLink: `Ver solicitação de ${tituloSolicitacao(s)}`,
  emenda: s.origemRecurso === 'EMENDA_PARLAMENTAR',
  automatica: Boolean(s.automatica),
});

const daManutencao = (m: Manutencao): LinhaLista => ({
  chave: `m-${m.id}`,
  id: m.id,
  numero: codigoManutencao(m.numero),
  titulo: tituloManutencao(m),
  tipo: TIPO_MANUTENCAO,
  tipoTexto: m.tipo === 'CIVIL' ? 'Manutenção civil' : ROTULO_TIPO_SOLICITACAO[TIPO_MANUTENCAO],
  unidade: m.unidade.nome,
  statusValor: m.status,
  statusTexto: ROTULO_STATUS_MANUTENCAO[m.status],
  criadoEm: m.criadoEm,
  para: `/manutencoes/${m.id}`,
  rotuloLink: `Ver manutenção de ${tituloManutencao(m)}`,
  emenda: false,
  automatica: false,
});

export function Solicitacoes() {
  const { usuario } = useAuth();
  // A terceirizada só tem manutenções; Galpão só solicitações; Administrador e Unidade, as duas
  const veManutencoes = usuario?.perfil === 'OPERADOR' || usuario?.perfil === 'UNIDADE' || usuario?.perfil === 'TERCEIRIZADA';
  const veSolicitacoes = usuario?.perfil !== 'TERCEIRIZADA';
  const [params] = useSearchParams();
  const [linhas, setLinhas] = useState<LinhaLista[]>([]);
  const [busca, setBusca] = useState('');
  const tipoDaUrl = params.get('tipo') ?? '';
  const statusDaUrl = params.get('status') ?? '';
  const [filtroTipo, setFiltroTipo] = useState(
    tipoDaUrl === TIPO_MANUTENCAO || tipoDaUrl in ROTULO_TIPO_SOLICITACAO ? tipoDaUrl : '',
  );
  const statusInicialValido =
    statusDaUrl in ROTULO_STATUS_SOLICITACAO ||
    statusDaUrl in ROTULO_STATUS_MANUTENCAO ||
    OPCOES_STATUS_EXTRA.some((o) => o.valor === statusDaUrl);
  const [filtroStatus, setFiltroStatus] = useState(statusInicialValido ? statusDaUrl : '');
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
    const extra = OPCOES_STATUS_EXTRA.find((o) => o.valor === filtroStatus);
    // Cada lado só é consultado quando o tipo e o status escolhidos existem nele
    const buscarSolicitacoes =
      veSolicitacoes &&
      filtroTipo !== TIPO_MANUTENCAO &&
      (!filtroStatus || Boolean(extra) || filtroStatus in ROTULO_STATUS_SOLICITACAO);
    const buscarManutencoes =
      veManutencoes && (!filtroTipo || filtroTipo === TIPO_MANUTENCAO) && (!filtroStatus || filtroStatus in ROTULO_STATUS_MANUTENCAO);
    const consulta = (statusBackend: string, tipo = '') => {
      const p = new URLSearchParams();
      if (busca) p.set('busca', busca);
      if (tipo) p.set('tipo', tipo);
      if (statusBackend) p.set('status', statusBackend);
      return p;
    };
    const pedidos: Array<Promise<LinhaLista[]>> = [];
    if (buscarSolicitacoes) {
      const p = consulta(extra?.statusBackend ?? filtroStatus, filtroTipo);
      pedidos.push(api.get<Solicitacao[]>(`/solicitacoes?${p}`).then((l) => l.map(daSolicitacao)));
    }
    if (buscarManutencoes) {
      pedidos.push(api.get<Manutencao[]>(`/manutencoes?${consulta(filtroStatus)}`).then((l) => l.map(daManutencao)));
    }
    Promise.all(pedidos)
      .then((listas) => {
        if (idRequisicao !== requisicao.current) return;
        setLinhas(listas.flat().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)));
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setLinhas([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as solicitações.');
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [busca, filtroTipo, filtroStatus, veSolicitacoes, veManutencoes]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  // Deep link da Home (Pendências): aplica tipo/status da URL ao abrir a lista
  useEffect(() => {
    setFiltroTipo(tipoDaUrl === TIPO_MANUTENCAO || tipoDaUrl in ROTULO_TIPO_SOLICITACAO ? tipoDaUrl : '');
    const statusOk =
      statusDaUrl in ROTULO_STATUS_SOLICITACAO ||
      statusDaUrl in ROTULO_STATUS_MANUTENCAO ||
      OPCOES_STATUS_EXTRA.some((o) => o.valor === statusDaUrl);
    setFiltroStatus(statusOk ? statusDaUrl : '');
  }, [tipoDaUrl, statusDaUrl]);

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
    ? linhas.filter((l) => l.statusValor === filtroStatus)
    : linhas;

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(solicitacoesExibidas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  function selecionarTipo(tipo: string) {
    setFiltroTipo(tipo);
    const statusValido =
      tipo === TIPO_MANUTENCAO ? filtroStatus in ROTULO_STATUS_MANUTENCAO : STATUS_POR_TIPO[tipo]?.includes(filtroStatus);
    if (tipo && filtroStatus && !statusValido) {
      setFiltroStatus('');
    }
  }

  const opcoesTipo: Array<[string, string]> = [
    ['', 'Todas'],
    ...(veSolicitacoes ? TIPOS_DE_SOLICITACAO : []),
    ...(veManutencoes ? ([[TIPO_MANUTENCAO, ROTULO_TIPO_SOLICITACAO[TIPO_MANUTENCAO]]] as Array<[string, string]>) : []),
  ];
  const visualizacaoAtual = opcoesTipo.find(([valor]) => valor === filtroTipo);
  // Status oferecidos conforme o tipo: de solicitação (por tipo), de manutenção, ou a soma dos dois em "Todas"
  const statusDeSolicitacao: Array<[string, string]> = [
    ...Object.entries(ROTULO_STATUS_SOLICITACAO),
    ...OPCOES_STATUS_EXTRA.map(({ valor, texto }): [string, string] => [valor, texto]),
  ];
  const opcoesDeStatus: Array<[string, string]> =
    filtroTipo === TIPO_MANUTENCAO
      ? Object.entries(ROTULO_STATUS_MANUTENCAO)
      : filtroTipo
        ? statusDeSolicitacao.filter(([valor]) => STATUS_POR_TIPO[filtroTipo]?.includes(valor))
        : [...(veSolicitacoes ? statusDeSolicitacao : []), ...(veManutencoes ? STATUS_SO_DE_MANUTENCAO : [])];
  const totalFiltros = Number(Boolean(filtroStatus));
  const podeCriar = usuario?.perfil === 'UNIDADE' || usuario?.perfil === 'OPERADOR';

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
                  <span className="inventario-visualizacao-rotulo">{visualizacaoAtual?.[1] ?? 'Todas'}</span>
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div
                    className="inventario-visualizacao-menu"
                    role="menu"
                    aria-label="Visualizações das solicitações"
                  >
                    {opcoesTipo.map(
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
                  {opcoesDeStatus.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
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
          className="gestao-tabela-scroll lista-cartoes"
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
                solicitacoesExibidas.slice(inicio, inicio + porPagina).map((l) => (
                  <tr key={l.chave}>
                    <td className="gestao-equipamento cartao-nome">
                      <span className="req-numero">{l.numero}</span>
                      <Link className="inventario-equipamento-link" to={l.para} aria-label={l.rotuloLink}>
                        {l.titulo}
                      </Link>
                      <div className="inventario-mobile-meta">
                        <span className="inventario-mobile-unidade">{l.unidade} · </span>
                        {formatarData(l.criadoEm)}
                      </div>
                    </td>
                    <td className="cartao-tipo">
                      <span className="inventario-data">{l.tipoTexto}</span>
                      {l.emenda && <span className="badge badge-purple solicitacoes-selo">Emenda</span>}
                      {l.automatica && <span className="badge badge-gray solicitacoes-selo">Automática</span>}
                    </td>
                    <td className="inventario-unidade cartao-unidade">
                      <strong>{l.unidade}</strong>
                    </td>
                    <td className="cartao-status">
                      <StatusPill valor={l.statusValor}>{l.statusTexto}</StatusPill>
                    </td>
                    <td className="inventario-data cartao-data">{formatarData(l.criadoEm)}</td>
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
