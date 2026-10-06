import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, urlArquivo } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import {
  IconeDislike,
  IconeLike,
  IconeBusca,
  IconeCheck,
  IconeRelogio,
  IconeSolicitacoes,
  IconeDetalhes,
  IconeAmpliacao,
  IconeSubstituicao,
  IconeEmprestimo,
  IconeRecolha,
  IconeCessaoExterna,
} from '../components/icons';
import './Solicitacoes.css';
import type { Solicitacao } from '../types';
import {
  formatarData,
  formatarMoeda,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
} from '../utils/format';

// Ampliação/Substituição seguem o fluxo de aquisição via ata; os demais
// tipos operam sobre um equipamento já existente no inventário da unidade.
const TIPOS_COM_ATA = ['AMPLIACAO', 'SUBSTITUICAO'];

// Aguardando Disponibilidade com estoque já disponível vira um badge próprio
// (verde, "Disponível para Reserva") em vez do status + um badge separado.
// Recolha ganha rótulos próprios: Pendente Aprovação de Recolha, e depois
// Aguardando Recolha (Patrimônio) ou (Branet) — escolhido pelo Gestor de
// uma vez, na aprovação, e não muda depois (feedback do cliente 26/08 e 27/08).
function statusExibido(s: Solicitacao) {
  if (s.status === 'AGUARDANDO_DISPONIBILIDADE' && s.disponivelParaReserva) {
    return { valor: 'DISPONIVEL_PARA_RESERVA', texto: 'Disponível para Reserva' };
  }
  if (s.tipo === 'RECOLHA') {
    if (s.status === 'PENDENTE_APROVACAO') {
      return { valor: s.status, texto: 'Pendente Aprovação de Recolha' };
    }
    if (s.status === 'AGUARDANDO_ENTREGA') {
      return s.pedidoEntregaRegistradoEm
        ? { valor: 'AGUARDANDO_RECOLHA_BRANET', texto: 'Aguardando Recolha (Branet)' }
        : { valor: 'AGUARDANDO_RECOLHA_PATRIMONIO', texto: 'Aguardando Recolha (Patrimônio)' };
    }
  }
  return { valor: s.status as string, texto: ROTULO_STATUS_SOLICITACAO[s.status] };
}

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

const ICONES_TIPO = {
  AMPLIACAO: <IconeAmpliacao />,
  SUBSTITUICAO: <IconeSubstituicao />,
  EMPRESTIMO: <IconeEmprestimo />,
  RECOLHA: <IconeRecolha />,
  CESSAO_USO: <IconeCessaoExterna />,
};

function nomeItem(s: Solicitacao) {
  return s.equipamento
    ? s.equipamento.tipoEquipamento?.nome || s.equipamento.descricao
    : (s.tipoEquipamento?.nome ?? 'Item');
}

export function Solicitacoes() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useState<string | null>(null);

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

  // Mensagem de sucesso vinda da navegação de volta da tela de Nova Solicitação
  useEffect(() => {
    const state = location.state as { mensagem?: string } | null;
    if (state?.mensagem) {
      setMensagem(state.mensagem);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const detalhe = solicitacoes.find((s) => s.id === detalheId) ?? null;
  // O backend filtra pelo status real (ex: AGUARDANDO_ENTREGA), mas quando o
  // filtro escolhido é um pseudo-status (ex: "Aguardando Recolha (Branet)")
  // ainda falta refinar no cliente pra bater exatamente com o badge exibido
  const solicitacoesExibidas = OPCOES_STATUS_EXTRA.some((o) => o.valor === filtroStatus)
    ? solicitacoes.filter((s) => statusExibido(s).valor === filtroStatus)
    : solicitacoes;

  const porPagina = 8;
  const totalPaginas = Math.max(1, Math.ceil(solicitacoesExibidas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const resumos = [
    {
      rotulo: 'Total de solicitações',
      valor: solicitacoesExibidas.length,
      cor: 'blue',
      icone: <IconeSolicitacoes />,
    },
    {
      rotulo: 'Aguardando aprovação',
      valor: solicitacoesExibidas.filter((s) => s.status === 'PENDENTE_APROVACAO').length,
      cor: 'yellow',
      icone: <IconeRelogio />,
    },
    {
      rotulo: 'Em andamento',
      valor: solicitacoesExibidas.filter(
        (s) =>
          !['PENDENTE_APROVACAO', 'CONCLUIDA', 'NEGADA', 'EXPIRADA', 'CANCELADA'].includes(
            s.status,
          ),
      ).length,
      cor: 'blue',
      icone: <IconeSolicitacoes />,
    },
    {
      rotulo: 'Concluídas',
      valor: solicitacoesExibidas.filter((s) => s.status === 'CONCLUIDA').length,
      cor: 'green',
      icone: <IconeCheck />,
    },
  ];

  function selecionarTipo(tipo: string) {
    setFiltroTipo(tipo);
    if (tipo && filtroStatus && !STATUS_POR_TIPO[tipo]?.includes(filtroStatus)) {
      setFiltroStatus('');
    }
  }

  return (
    <section className="gestao-page solicitacoes-page" aria-labelledby="solicitacoes-titulo">
      <div className="page-header">
        <div>
          <h2 id="solicitacoes-titulo">Solicitações</h2>
          <p className="subtitle">Acompanhe os pedidos e cada etapa da movimentação de bens.</p>
        </div>
        {(usuario?.perfil === 'UNIDADE' || usuario?.perfil === 'GESTOR_PATRIMONIO') && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => navigate('/solicitacoes/nova')}>
              + Nova Solicitação
            </button>
          </div>
        )}
      </div>

      {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
      {erro && (
        <div className="error-banner" role="alert">
          {erro}
        </div>
      )}

      <div className="gestao-resumo-label">Resumo da seleção atual</div>
      <div className="gestao-resumo" aria-label="Resumo da seleção atual">
        {resumos.map((resumo) => (
          <div className="card gestao-indicador" key={resumo.rotulo}>
            <span className={`gestao-indicador-icone tom-${resumo.cor}`}>{resumo.icone}</span>
            <div>
              <span className="gestao-indicador-label">{resumo.rotulo}</span>
              <strong>
                {carregando || falhaCarregamento ? '—' : resumo.valor.toLocaleString('pt-BR')}
              </strong>
            </div>
          </div>
        ))}
      </div>

      <div className="card gestao-lista solicitacoes-lista">
        <div className="gestao-status" role="group" aria-label="Filtrar por tipo de solicitação">
          {[['', 'Todas'], ...Object.entries(ROTULO_TIPO_SOLICITACAO)].map(([valor, rotulo]) => (
            <button
              type="button"
              key={valor}
              aria-pressed={filtroTipo === valor}
              onClick={() => selecionarTipo(valor)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="toolbar gestao-filtros">
          <div className="gestao-busca">
            <IconeBusca />
            <input
              className="search"
              aria-label="Buscar solicitações"
              placeholder="Buscar por item, tombamento ou unidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
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
          {(busca || filtroTipo || filtroStatus) && (
            <button
              className="btn btn-outline"
              onClick={() => {
                setBusca('');
                setFiltroTipo('');
                setFiltroStatus('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="solicitacoes-resultados" aria-busy={carregando}>
          {!carregando &&
            !falhaCarregamento &&
            solicitacoesExibidas.slice(inicio, inicio + porPagina).map((s) => (
              <article key={s.id} className="solicitacao-card" onClick={() => setDetalheId(s.id)}>
                <div className="solicitacao-icone" aria-hidden>
                  {ICONES_TIPO[s.tipo]}
                </div>
                <div className="solicitacao-conteudo">
                  <div className="solicitacao-etiquetas">
                    <span className="solicitacao-tipo">{ROTULO_TIPO_SOLICITACAO[s.tipo]}</span>
                    {s.equipamento && <span className="tomb">#{s.equipamento.tombamento}</span>}
                    {s.origemRecurso === 'EMENDA_PARLAMENTAR' && (
                      <span className="badge badge-purple">Emenda</span>
                    )}
                    {s.automatica && <span className="badge badge-gray">Automática</span>}
                  </div>
                  <h3>{nomeItem(s)}</h3>
                  <div className="solicitacao-trajeto">
                    <span>
                      <span className="solicitacao-legenda">Origem</span>
                      {s.unidadeOrigem.nome}
                    </span>
                    {s.unidadeDestino && s.tipo !== 'RECOLHA' && (
                      <span>
                        <span className="solicitacao-legenda">Destino</span>
                        {s.unidadeDestino.nome}
                      </span>
                    )}
                    {s.entidadeExternaNome && (
                      <span>
                        <span className="solicitacao-legenda">Destino externo</span>
                        {s.entidadeExternaNome}
                      </span>
                    )}
                    {!!s.quantidade && s.tipo !== 'CESSAO_USO' && (
                      <span>
                        <span className="solicitacao-legenda">Quantidade</span>
                        {s.quantidade}
                      </span>
                    )}
                  </div>
                  <p className="solicitacao-descricao">{s.justificativa}</p>
                  <div className="solicitacao-meta">
                    <span>Solicitado em {formatarData(s.criadoEm)}</span>
                    {s.criadoPor && <span>Por {s.criadoPor.nome}</span>}
                    {s.dataRetornoPrevista && (
                      <span className="solicitacao-retorno">
                        Retorno previsto: {formatarData(s.dataRetornoPrevista)}
                      </span>
                    )}
                    {s.ata && <span>Ata: {s.ata.numero}</span>}
                  </div>
                </div>
                <div className="solicitacao-acoes">
                  <Badge valor={statusExibido(s).valor}>{statusExibido(s).texto}</Badge>
                  {s.prioridade && (
                    <span className="badge badge-purple">Prioridade {s.prioridade}</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline"
                    aria-label={`Ver solicitação de ${nomeItem(s)}`}
                  >
                    <IconeDetalhes /> Ver detalhes
                  </button>
                </div>
              </article>
            ))}
          {(carregando || falhaCarregamento || solicitacoesExibidas.length === 0) && (
            <div className="empty-state" role="status">
              {carregando
                ? 'Carregando solicitações…'
                : falhaCarregamento
                  ? 'Não foi possível carregar as solicitações.'
                  : 'Nenhuma solicitação encontrada'}
              {!carregando && falhaCarregamento && (
                <button className="btn btn-outline" onClick={carregar}>
                  Tentar novamente
                </button>
              )}
            </div>
          )}
        </div>
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
                  {solicitacoesExibidas.length === 1 ? 'ão' : 'ões'} encontrada
                  {solicitacoesExibidas.length === 1 ? '' : 's'}
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

      {detalhe && (
        <DetalheSolicitacao
          solicitacao={detalhe}
          onFechar={() => setDetalheId(null)}
          onAtualizado={(msg) => {
            // Mantém o modal aberto — dá pra seguir o fluxo (aprovar →
            // reservar → lançar no Branet...) sem reabrir a cada passo
            setMensagem(msg);
            carregar();
          }}
        />
      )}
    </section>
  );
}

function DetalheSolicitacao({
  solicitacao: s,
  onFechar,
  onAtualizado,
}: {
  solicitacao: Solicitacao;
  onFechar: () => void;
  onAtualizado: (mensagem: string) => void;
}) {
  const { usuario } = useAuth();
  const [erro, setErro] = useMensagemTemporaria();
  const [motivo, setMotivo] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [acaoPendente, setAcaoPendente] = useState<'aprovar' | 'negar' | null>(null);
  // Gestor: aprovar Recolha exige escolher direto em qual das duas etapas ela
  // já está — não escolhe mais um galpão (feedback 27/08)
  const [etapaRecolha, setEtapaRecolha] = useState<'PATRIMONIO' | 'BRANET' | ''>('');
  // Gestor: lançar no Branet (número do pedido + tombamento de cada item)
  const [numeroPedidoBranet, setNumeroPedidoBranet] = useState('');
  const [itensBranet, setItensBranet] = useState(
    Array.from({ length: s.quantidade ?? 1 }, () => ({ tombamento: '', descricao: '' })),
  );
  // Unidade: confirmar recebimento (OK/Não OK + tombamento de cada item)
  const [recebimentoOk, setRecebimentoOk] = useState<boolean | null>(null);
  const [observacaoRecebimento, setObservacaoRecebimento] = useState('');
  const [tombamentosConfirmados, setTombamentosConfirmados] = useState<Record<string, string>>({});
  // Gestor: ajustar tombamento (corrigir divergência antes de concluir)
  const [ajustandoTombamento, setAjustandoTombamento] = useState(false);
  const [itensAjuste, setItensAjuste] = useState(
    () => (s.itensGerados ?? []).map((eq) => ({ equipamentoId: eq.id, tombamento: eq.tombamento })),
  );

  // O modal fica aberto entre uma ação e outra (feedback 18/08 — não precisa
  // reabrir pra cada passo do fluxo), então os formulários de ação precisam
  // resetar sozinhos sempre que o status muda, senão ficam com lixo da etapa anterior
  useEffect(() => {
    setAcaoPendente(null);
    setMotivo('');
    setPrioridade('');
    setNumeroPedidoBranet('');
    setItensBranet(Array.from({ length: s.quantidade ?? 1 }, () => ({ tombamento: '', descricao: '' })));
    setRecebimentoOk(null);
    setObservacaoRecebimento('');
    setTombamentosConfirmados({});
    setAjustandoTombamento(false);
    setItensAjuste((s.itensGerados ?? []).map((eq) => ({ equipamentoId: eq.id, tombamento: eq.tombamento })));
    setEtapaRecolha('');
  }, [s.status]);

  const ehGP = usuario?.perfil === 'GESTOR_PATRIMONIO';
  // Confirmação de recebimento de Ampliação/Substituição, saída e retorno de
  // Empréstimo/Cessão são só da Unidade de origem — nem o Gestor de
  // Patrimônio pode fazer isso por ela (feedback 18/08)
  const souUnidadeOrigem = usuario?.perfil === 'UNIDADE' && usuario.unidadeId === s.unidadeOrigem.id;

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setErro(null);
    try {
      await acao();
      onAtualizado(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  const pendente = s.status === 'PENDENTE_APROVACAO';
  const aguardandoDisponibilidade = s.status === 'AGUARDANDO_DISPONIBILIDADE';

  return (
    <Modal
      titulo={`Solicitação — ${ROTULO_TIPO_SOLICITACAO[s.tipo]}`}
      subtitulo={
        s.equipamento
          ? `#${s.equipamento.tombamento} — ${s.equipamento.tipoEquipamento?.nome || s.equipamento.descricao}`
          : s.tipoEquipamento?.nome
      }
      onFechar={onFechar}
    >
      {erro && <div className="error-banner toast-erro">{erro}</div>}
      <div className="info-grid">
        <div className="info-box">
          <div className="info-label">Unidade de Origem</div>
          <div className="info-value">{s.unidadeOrigem.nome}</div>
        </div>
        {/* Recolha sempre vai pro galpão padrão — não é informação relevante
            pra mostrar (feedback do cliente 27/08) */}
        {s.unidadeDestino && s.tipo !== 'RECOLHA' && (
          <div className="info-box">
            <div className="info-label">Unidade de Destino</div>
            <div className="info-value">{s.unidadeDestino.nome}</div>
          </div>
        )}
        {s.entidadeExternaNome && (
          <div className="info-box">
            <div className="info-label">Entidade Externa</div>
            <div className="info-value">{s.entidadeExternaNome}</div>
          </div>
        )}
        {s.numerosPatrimonio && s.numerosPatrimonio.length > 0 && (
          <div className="info-box">
            <div className="info-label">
              {s.numerosPatrimonio.length > 1 ? 'Nºs de Patrimônio' : 'Nº de Patrimônio'}
            </div>
            <div className="info-value">{s.numerosPatrimonio.join(', ')}</div>
          </div>
        )}
        <div className="info-box">
          <div className="info-label">Status</div>
          <div className="info-value">
            <Badge valor={statusExibido(s).valor}>{statusExibido(s).texto}</Badge>
          </div>
        </div>
        {s.quantidade && s.tipo !== 'CESSAO_USO' && (
          <div className="info-box">
            <div className="info-label">Quantidade</div>
            <div className="info-value">{s.quantidade}</div>
          </div>
        )}
        {s.dataRetornoPrevista && (
          <div className="info-box">
            <div className="info-label">Retorno Previsto</div>
            <div className="info-value">{formatarData(s.dataRetornoPrevista)}</div>
          </div>
        )}
        {s.ata && ehGP && (
          <div className="info-box">
            <div className="info-label">Ata Vinculada</div>
            <div className="info-value">
              {s.ata.numero} {s.valorVinculado && `(${formatarMoeda(s.valorVinculado)})`}
            </div>
          </div>
        )}
      </div>
      <div className="section-title">Justificativa</div>
      <div className="info-box" style={{ marginBottom: 14 }}>
        {s.justificativa}
      </div>
      <div className="section-title">Anexo</div>
      {s.anexoUrl ? (
        <a href={urlArquivo(s.anexoUrl)} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 14 }}>
          {s.anexoUrl.endsWith('.pdf') ? (
            <span className="badge badge-gray">📄 Ver anexo (PDF)</span>
          ) : (
            <img src={urlArquivo(s.anexoUrl)} alt="Anexo da solicitação" style={{ maxWidth: 240, borderRadius: 8 }} />
          )}
        </a>
      ) : (
        <div className="info-box" style={{ marginBottom: 14, color: 'var(--text-secondary)' }}>
          Sem arquivos anexados
        </div>
      )}
      {s.motivoNegacao && (
        <>
          <div className="section-title">Motivo da Negação</div>
          <div className="error-banner">{s.motivoNegacao}</div>
        </>
      )}

      {/* GP: aprovar/negar — sem escolher ata aqui (o sistema decide sozinho
          se reserva do estoque ou fica aguardando disponibilidade) */}
      {ehGP && pendente && (
        <div className="actions-box">
          <div className="actions-title">Ações Disponíveis</div>

          {acaoPendente === null && (
            <div className="actions-row">
              <button className="btn-link sucesso" onClick={() => setAcaoPendente('aprovar')}>
                <IconeLike /> <span>Aprovar Solicitação</span>
              </button>
              <button className="btn-link perigo" onClick={() => setAcaoPendente('negar')}>
                <IconeDislike /> <span>Negar Solicitação</span>
              </button>
            </div>
          )}

          <div className={`actions-expand${acaoPendente ? ' aberto' : ''}`}>
            <div>
              {acaoPendente === 'aprovar' && (
                <>
                  {TIPOS_COM_ATA.includes(s.tipo) && (
                    <div className="field">
                      <label>Prioridade *</label>
                      <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} required>
                        <option value="" disabled>
                          Selecione a prioridade...
                        </option>
                        <option value="1">1 — Alta</option>
                        <option value="2">2 — Média</option>
                        <option value="3">3 — Baixa</option>
                      </select>
                    </div>
                  )}
                  {s.tipo === 'RECOLHA' && (
                    <div className="field">
                      <label>Etapa da Recolha *</label>
                      <div className="actions-row" style={{ marginBottom: 0 }}>
                        <button
                          type="button"
                          className={`btn ${etapaRecolha === 'PATRIMONIO' ? 'btn-success' : 'btn-outline'}`}
                          onClick={() => setEtapaRecolha('PATRIMONIO')}
                        >
                          Aguardando Recolha (Patrimônio)
                        </button>
                        <button
                          type="button"
                          className={`btn ${etapaRecolha === 'BRANET' ? 'btn-success' : 'btn-outline'}`}
                          onClick={() => setEtapaRecolha('BRANET')}
                        >
                          Aguardando Recolha (Branet)
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="actions-row">
                    <button
                      className="btn-link sucesso"
                      disabled={
                        (TIPOS_COM_ATA.includes(s.tipo) && !prioridade) ||
                        (s.tipo === 'RECOLHA' && !etapaRecolha)
                      }
                      onClick={() =>
                        executar(
                          () =>
                            api.post(`/solicitacoes/${s.id}/aprovar`, {
                              ...(prioridade ? { prioridade: Number(prioridade) } : {}),
                              ...(etapaRecolha ? { etapaRecolha } : {}),
                            }),
                          'Solicitação aprovada.',
                        )
                      }
                    >
                      <IconeLike /> <span>Confirmar Aprovação</span>
                    </button>
                    <button className="btn-link" onClick={() => setAcaoPendente(null)}>
                      <span>Cancelar</span>
                    </button>
                  </div>
                </>
              )}

              {acaoPendente === 'negar' && (
                <>
                  <div className="field">
                    <label>Motivo da negação *</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </div>
                  <div className="actions-row">
                    <button
                      className="btn-link perigo"
                      disabled={!motivo.trim()}
                      onClick={() =>
                        executar(
                          () => api.post(`/solicitacoes/${s.id}/negar`, { motivo }),
                          'Solicitação negada.',
                        )
                      }
                    >
                      <IconeDislike /> <span>Confirmar Negação</span>
                    </button>
                    <button className="btn-link" onClick={() => setAcaoPendente(null)}>
                      <span>Cancelar</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GP: aguardando disponibilidade — vincular ata (compra) ou tentar
          reservar do estoque de novo (ex: chegou estoque novo) */}
      {ehGP && aguardandoDisponibilidade && (
        <div className="actions-box">
          <div className="actions-title">Aguardando Disponibilidade</div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              disabled={!s.disponivelParaReserva}
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/tentar-reservar-estoque`),
                  'Solicitação em andamento.',
                )
              }
            >
              Reservar do Estoque
            </button>
          </div>
        </div>
      )}

      {/* GP: reservado — informa o número do pedido Branet. Ampliação/
          Substituição também informam o tombamento de cada item, o que já
          cadastra os equipamentos e avança pra Aguardando Entrega (feedback
          do cliente 17/08: quem lida com o tombamento agora é o Gestor, não
          mais o Galpão depois). Cessão de Uso reservou do estoque na própria
          criação e não gera tombamento novo (destino externo) — só registra
          o número do pedido e já conclui direto. */}
      {ehGP && s.status === 'RESERVADO' && (
        <div className="actions-box">
          <div className="actions-title">Lançar no Branet</div>
          <div className="field">
            <label>Número do Pedido (Branet) *</label>
            <input value={numeroPedidoBranet} onChange={(e) => setNumeroPedidoBranet(e.target.value)} />
          </div>
          {s.tipo !== 'CESSAO_USO' &&
            itensBranet.map((item, i) => (
              <div key={i} className="item-ampliacao">
                <div className="item-ampliacao-cabecalho">
                  <span className="item-ampliacao-numero">
                    {s.tipoEquipamento?.nome ?? 'Item'}
                    {itensBranet.length > 1 ? ` — unidade ${i + 1} de ${itensBranet.length}` : ''}
                  </span>
                </div>
                <div className="info-grid" style={{ marginBottom: 0 }}>
                  <div className="field">
                    <label>Tombamento *</label>
                    <input
                      value={item.tombamento}
                      onChange={(e) => {
                        const novos = [...itensBranet];
                        novos[i] = { ...item, tombamento: e.target.value };
                        setItensBranet(novos);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Descrição *</label>
                    <input
                      value={item.descricao}
                      onChange={(e) => {
                        const novos = [...itensBranet];
                        novos[i] = { ...item, descricao: e.target.value };
                        setItensBranet(novos);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          <div className="actions-row">
            <button
              className="btn btn-success"
              disabled={
                !numeroPedidoBranet ||
                (s.tipo !== 'CESSAO_USO' && itensBranet.some((i) => !i.tombamento || !i.descricao))
              }
              onClick={() =>
                executar(
                  () =>
                    api.post(`/solicitacoes/${s.id}/lancar-branet`, {
                      numeroPedidoBranet,
                      ...(s.tipo !== 'CESSAO_USO' ? { itens: itensBranet } : {}),
                    }),
                  s.tipo === 'CESSAO_USO'
                    ? 'Pedido lançado no Branet — cessão concluída.'
                    : 'Pedido lançado no Branet e tombamento cadastrado.',
                )
              }
            >
              ✓ Lançar no Branet
            </button>
          </div>
        </div>
      )}

      {/* GP: validação final, depois que a unidade já confirmou o recebimento */}
      {ehGP && s.status === 'AGUARDANDO_VALIDACAO' && (
        <div className="actions-box">
          <div className="actions-title">Aguardando validação final</div>
          {s.recebimentoOk === false && (
            <div className="error-banner" style={{ marginBottom: 12 }}>
              ⚠️ {s.observacaoRecebimento}
            </div>
          )}
          {!ajustandoTombamento ? (
            <div className="actions-row">
              <button className="btn btn-success" onClick={() => executar(
                () => api.post(`/solicitacoes/${s.id}/concluir`),
                'Solicitação concluída.',
              )}>
                ✓ Concluir Solicitação
              </button>
              {(s.itensGerados?.length ?? 0) > 0 && (
                <button className="btn btn-outline" onClick={() => setAjustandoTombamento(true)}>
                  Ajustar tombamento
                </button>
              )}
            </div>
          ) : (
            <>
              {itensAjuste.map((item, i) => (
                <div key={item.equipamentoId} className="field">
                  <label>
                    Tombamento —{' '}
                    {s.itensGerados?.find((eq) => eq.id === item.equipamentoId)?.descricao ?? `item ${i + 1}`} *
                  </label>
                  <input
                    value={item.tombamento}
                    onChange={(e) => {
                      const novos = [...itensAjuste];
                      novos[i] = { ...item, tombamento: e.target.value };
                      setItensAjuste(novos);
                    }}
                  />
                </div>
              ))}
              <div className="actions-row">
                <button
                  className="btn btn-success"
                  onClick={() =>
                    executar(
                      () => api.patch(`/solicitacoes/${s.id}/ajustar-tombamento`, { itens: itensAjuste }),
                      'Tombamento ajustado.',
                    )
                  }
                >
                  ✓ Salvar Ajuste
                </button>
                <button className="btn btn-outline" onClick={() => setAjustandoTombamento(false)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Empréstimo: origem confirma a saída física do equipamento, que
          passa a "emprestado" (aguardando retorno). */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_SAIDA' && souUnidadeOrigem && (
        <div className="actions-box">
          <div className="actions-title">Confirmar saída do item</div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-saida`),
                  'Saída confirmada — empréstimo em andamento.',
                )
              }
            >
              ✓ Confirmar Saída
            </button>
          </div>
        </div>
      )}

      {/* Ampliação/Substituição: unidade solicitante confirma o recebimento
          do item (já com tombamento, lançado pelo Gestor) — OK/Não OK binário;
          se OK, confirma o tombamento de cada item pra bater com o cadastrado
          (feedback do cliente 17/08). Não conclui sozinho, aguarda validação.
          Só a Unidade — nem o Gestor de Patrimônio confirma isso por ela
          (feedback 18/08). */}
      {TIPOS_COM_ATA.includes(s.tipo) && s.status === 'AGUARDANDO_ENTREGA' && souUnidadeOrigem && (
        <div className="actions-box">
          <div className="actions-title">Confirmar recebimento</div>
          <div className="actions-row" style={{ marginBottom: 12 }}>
            <button
              className={`btn ${recebimentoOk === true ? 'btn-success' : 'btn-outline'}`}
              onClick={() => setRecebimentoOk(true)}
              type="button"
            >
              ✓ OK
            </button>
            <button
              className={`btn ${recebimentoOk === false ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => setRecebimentoOk(false)}
              type="button"
            >
              ✕ Não OK
            </button>
          </div>
          {recebimentoOk === false && (
            <div className="field">
              <label>O que não está OK? *</label>
              <input
                value={observacaoRecebimento}
                onChange={(e) => setObservacaoRecebimento(e.target.value)}
              />
            </div>
          )}
          {recebimentoOk === true && (
            <>
              {(s.itensGerados ?? []).map((eq) => (
                <div key={eq.id} className="field">
                  <label>Confirme o nº de patrimônio — {eq.descricao} *</label>
                  <input
                    value={tombamentosConfirmados[eq.id] ?? ''}
                    onChange={(e) =>
                      setTombamentosConfirmados({ ...tombamentosConfirmados, [eq.id]: e.target.value })
                    }
                  />
                </div>
              ))}
            </>
          )}
          <div className="actions-row">
            <button
              className="btn btn-success"
              disabled={
                recebimentoOk === null ||
                (recebimentoOk === false && !observacaoRecebimento.trim()) ||
                (recebimentoOk === true &&
                  (s.itensGerados ?? []).some((eq) => !tombamentosConfirmados[eq.id]?.trim()))
              }
              onClick={() =>
                executar(
                  () =>
                    api.post(`/solicitacoes/${s.id}/confirmar-recebimento`, {
                      ok: recebimentoOk,
                      ...(recebimentoOk === false ? { observacao: observacaoRecebimento } : {}),
                      ...(recebimentoOk === true
                        ? {
                            itens: (s.itensGerados ?? []).map((eq) => ({
                              equipamentoId: eq.id,
                              tombamentoConfirmado: tombamentosConfirmados[eq.id],
                            })),
                          }
                        : {}),
                    }),
                  'Recebimento confirmado — aguardando validação do Patrimônio.',
                )
              }
            >
              ✓ Confirmar Recebimento
            </button>
          </div>
        </div>
      )}

      {/* Empréstimo: origem confirma retorno */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_RETORNO' && souUnidadeOrigem && (
        <div className="actions-box">
          <div className="actions-title">Encerrar empréstimo</div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-retorno`),
                  'Empréstimo encerrado — item devolvido.',
                )
              }
            >
              ✓ Confirmar Retorno do Item
            </button>
          </div>
        </div>
      )}

      {/* Unidade de origem: confirma que o equipamento realmente saiu — não é
          mais o galpão quem confirma (feedback 26/08). A etapa (Patrimônio/
          Branet) é escolhida uma vez, na aprovação, e não é pré-requisito
          pra confirmar (feedback 27/08). */}
      {s.tipo === 'RECOLHA' && s.status === 'AGUARDANDO_ENTREGA' && souUnidadeOrigem && (
        <div className="actions-box">
          <div className="actions-title">Confirmar recolha</div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-recolha`),
                  'Recolha confirmada — aguardando validação do Patrimônio.',
                )
              }
            >
              ✓ Confirmar Recolha
            </button>
          </div>
        </div>
      )}

    </Modal>
  );
}
