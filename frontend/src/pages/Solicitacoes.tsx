import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, urlArquivo } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { IconeDislike, IconeLike } from '../components/icons';
import type { Solicitacao } from '../types';
import {
  formatarData,
  formatarMoeda,
  ROTULO_ESTADO,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
} from '../utils/format';

// Ampliação/Substituição seguem o fluxo de aquisição via ata; os demais
// tipos operam sobre um equipamento já existente no inventário da unidade.
const TIPOS_COM_ATA = ['AMPLIACAO', 'SUBSTITUICAO'];

// Aguardando Disponibilidade com estoque já disponível vira um badge próprio
// (verde, "Disponível para Reserva") em vez do status + um badge separado
function statusExibido(s: Solicitacao) {
  if (s.status === 'AGUARDANDO_DISPONIBILIDADE' && s.disponivelParaReserva) {
    return { valor: 'DISPONIVEL_PARA_RESERVA', texto: 'Disponível para Reserva' };
  }
  return { valor: s.status as string, texto: ROTULO_STATUS_SOLICITACAO[s.status] };
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

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroTipo) params.set('tipo', filtroTipo);
    if (filtroStatus) params.set('status', filtroStatus);
    api
      .get<Solicitacao[]>(`/solicitacoes?${params}`)
      .then(setSolicitacoes)
      .catch((e) => setErro(e.message));
  }, [busca, filtroTipo, filtroStatus]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Mensagem de sucesso vinda da navegação de volta da tela de Nova Solicitação
  useEffect(() => {
    const state = location.state as { mensagem?: string } | null;
    if (state?.mensagem) {
      setMensagem(state.mensagem);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const detalhe = solicitacoes.find((s) => s.id === detalheId) ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Solicitações</h2>
          <p className="count-sub">
            {solicitacoes.length} solicitaç{solicitacoes.length === 1 ? 'ão' : 'ões'} encontrada
            {solicitacoes.length === 1 ? '' : 's'}
          </p>
        </div>
        {usuario?.perfil === 'UNIDADE' && (
          <button className="btn btn-primary" onClick={() => navigate('/solicitacoes/nova')}>
            + Nova Solicitação
          </button>
        )}
      </div>

      {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
      {erro && <div className="error-banner">{erro}</div>}

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Buscar por equipamento, tombamento ou unidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(ROTULO_TIPO_SOLICITACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(ROTULO_STATUS_SOLICITACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="request-list">
          {solicitacoes.map((s) => (
            <div key={s.id} className="request-item" onClick={() => setDetalheId(s.id)}>
              <div>
                <div className="request-title">
                  <Badge valor={s.tipo}>{ROTULO_TIPO_SOLICITACAO[s.tipo]}</Badge>
                  {s.equipamento
                    ? `${s.equipamento.descricao}`
                    : s.tipoEquipamento?.nome ?? 'Equipamento'}
                  {s.equipamento && <span className="tomb">#{s.equipamento.tombamento}</span>}
                  {s.origemRecurso === 'EMENDA_PARLAMENTAR' && (
                    <span className="badge badge-purple">Emenda</span>
                  )}
                  {s.automatica && <span className="badge badge-gray">Automática</span>}
                </div>
                <div className="request-sub">
                  Origem: {s.unidadeOrigem.nome}
                  {s.unidadeDestino && <> ⇆ Destino: {s.unidadeDestino.nome}</>}
                  {s.entidadeExternaNome && <> ⇆ Destino: {s.entidadeExternaNome} (externo)</>}
                  {s.quantidade && <> · Qtd: {s.quantidade}</>}
                </div>
                <div className="request-desc">{s.justificativa}</div>
                <div className="request-meta">
                  <span>Solicitado em {formatarData(s.criadoEm)}</span>
                  {s.criadoPor && <span>Por {s.criadoPor.nome}</span>}
                  {s.dataRetornoPrevista && (
                    <span style={{ color: '#b45309' }}>
                      Retorno previsto: {formatarData(s.dataRetornoPrevista)}
                    </span>
                  )}
                  {s.ata && <span>Ata: {s.ata.numero}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <Badge valor={statusExibido(s).valor}>{statusExibido(s).texto}</Badge>
                {s.prioridade && (
                  <span className="badge badge-purple">Prioridade {s.prioridade}</span>
                )}
              </div>
            </div>
          ))}
          {solicitacoes.length === 0 && (
            <div className="empty-state">Nenhuma solicitação encontrada</div>
          )}
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
    </>
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
  const [estado, setEstado] = useState('BOM');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.status]);

  const ehGP = usuario?.perfil === 'GESTOR_PATRIMONIO';
  const ehGalpao = usuario?.perfil === 'GALPAO';
  const ehOrigem = usuario?.unidadeId === s.unidadeOrigem.id || ehGP;
  const ehDestino = usuario?.unidadeId === s.unidadeDestino?.id || ehGP;
  // Confirmação de recebimento de Ampliação/Substituição é só da Unidade —
  // nem o Gestor de Patrimônio pode fazer isso por ela (feedback 18/08)
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
          ? `#${s.equipamento.tombamento} - ${s.equipamento.descricao}`
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
        {s.unidadeDestino && (
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
        <div className="info-box">
          <div className="info-label">Status</div>
          <div className="info-value">
            <Badge valor={statusExibido(s).valor}>{statusExibido(s).texto}</Badge>
          </div>
        </div>
        {s.quantidade && (
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
      {s.anexoUrl && (
        <>
          <div className="section-title">Anexo</div>
          <a href={urlArquivo(s.anexoUrl)} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 14 }}>
            {s.anexoUrl.endsWith('.pdf') ? (
              <span className="badge badge-gray">📄 Ver anexo (PDF)</span>
            ) : (
              <img src={urlArquivo(s.anexoUrl)} alt="Anexo da solicitação" style={{ maxWidth: 240, borderRadius: 8 }} />
            )}
          </a>
        </>
      )}
      {s.motivoNegacao && (
        <>
          <div className="section-title">Motivo da Negação</div>
          <div className="error-banner">{s.motivoNegacao}</div>
        </>
      )}

      {/* GP: aprovar/negar — sem escolher ata aqui (o sistema decide sozinho
          se reserva do estoque ou fica aguardando disponibilidade) */}
      {ehGP && pendente && s.tipo !== 'EMPRESTIMO' && (
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
                  <div className="actions-row">
                    <button
                      className="btn-link sucesso"
                      disabled={TIPOS_COM_ATA.includes(s.tipo) && !prioridade}
                      onClick={() =>
                        executar(
                          () =>
                            api.post(`/solicitacoes/${s.id}/aprovar`, {
                              ...(prioridade ? { prioridade: Number(prioridade) } : {}),
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

      {/* GP: reservado — informa o número do pedido Branet e o tombamento de
          cada item; isso já cadastra os equipamentos e avança pra Aguardando
          Entrega (feedback do cliente 17/08: quem lida com o tombamento
          agora é o Gestor, não mais o Galpão depois) */}
      {ehGP && s.status === 'RESERVADO' && (
        <div className="actions-box">
          <div className="actions-title">Lançar no Branet</div>
          <div className="field">
            <label>Número do Pedido (Branet) *</label>
            <input value={numeroPedidoBranet} onChange={(e) => setNumeroPedidoBranet(e.target.value)} />
          </div>
          {itensBranet.map((item, i) => (
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
              disabled={!numeroPedidoBranet || itensBranet.some((i) => !i.tombamento || !i.descricao)}
              onClick={() =>
                executar(
                  () =>
                    api.post(`/solicitacoes/${s.id}/lancar-branet`, {
                      numeroPedidoBranet,
                      itens: itensBranet,
                    }),
                  'Pedido lançado no Branet e tombamento cadastrado.',
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

      {/* Cessão externa: origem confirma saída (já conclui a solicitação) */}
      {s.tipo === 'CESSAO_USO' && s.status === 'AGUARDANDO_SAIDA' && ehOrigem && (
        <div className="actions-box">
          <div className="actions-title">Confirmar saída do equipamento</div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-saida`),
                  'Saída confirmada — cessão concluída.',
                )
              }
            >
              ✓ Confirmar Saída
            </button>
          </div>
        </div>
      )}

      {/* Empréstimo: destino confirma recebimento e avalia o estado */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_RECEBIMENTO' && ehDestino && (
        <div className="actions-box">
          <div className="actions-title">Confirmar recebimento e avaliar o estado</div>
          <div className="field">
            <label>Estado do equipamento no recebimento</label>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              {Object.entries(ROTULO_ESTADO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () =>
                    api.post(`/solicitacoes/${s.id}/confirmar-recebimento`, {
                      estadoRecebimento: estado,
                    }),
                  s.dataRetornoPrevista
                    ? 'Recebimento confirmado.'
                    : 'Recebimento confirmado — transferência concluída.',
                )
              }
            >
              ✓ Confirmar Recebimento
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

      {/* Empréstimo temporário: origem confirma retorno */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_RETORNO' && ehOrigem && (
        <div className="actions-box">
          <div className="actions-title">Encerrar empréstimo</div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-retorno`),
                  'Empréstimo encerrado — equipamento devolvido.',
                )
              }
            >
              ✓ Confirmar Retorno do Equipamento
            </button>
          </div>
        </div>
      )}

      {/* Galpão: confirmar recolha */}
      {ehGalpao && s.tipo === 'RECOLHA' && s.status === 'AGUARDANDO_ENTREGA' && (
        <div className="actions-box">
          <div className="actions-title">Confirmar recebimento da recolha no galpão</div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-recolha`),
                  'Recolha concluída — equipamento no galpão.',
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
