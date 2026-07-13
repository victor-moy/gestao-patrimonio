import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import type { Ata, Categoria, Equipamento, Solicitacao, Unidade } from '../types';
import {
  formatarData,
  formatarMoeda,
  ROTULO_ESTADO,
  ROTULO_STATUS_SOLICITACAO,
  ROTULO_TIPO_SOLICITACAO,
} from '../utils/format';

export function Solicitacoes() {
  const { usuario } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
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
          <button className="btn btn-primary" onClick={() => setNovaAberta(true)}>
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
              <div>
                <Badge valor={s.status}>{ROTULO_STATUS_SOLICITACAO[s.status]}</Badge>
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
            setDetalheId(null);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
      {novaAberta && (
        <NovaSolicitacao
          onFechar={() => setNovaAberta(false)}
          onSucesso={() => {
            setNovaAberta(false);
            setMensagem('Solicitação registrada.');
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
  const [atas, setAtas] = useState<Ata[]>([]);
  const [ataId, setAtaId] = useState('');
  const [valor, setValor] = useState('');
  const [estado, setEstado] = useState('BOM');
  const [itens, setItens] = useState([
    { tombamento: '', descricao: '', estadoConservacao: 'BOM' },
  ]);

  const ehGP = usuario?.perfil === 'GESTOR_PATRIMONIO';
  const ehGalpao = usuario?.perfil === 'GALPAO';
  const ehOrigem = usuario?.unidadeId === s.unidadeOrigem.id || ehGP;
  const ehDestino = usuario?.unidadeId === s.unidadeDestino?.id || ehGP;

  useEffect(() => {
    if (ehGP && s.tipo === 'NOVO_ITEM') {
      api.get<Ata[]>('/atas').then(setAtas).catch(() => {});
    }
  }, [ehGP, s.tipo]);

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
  const aguardandoAta = s.status === 'APROVADA_AGUARDANDO_ATA';

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
        <div className="info-box">
          <div className="info-label">Status</div>
          <div className="info-value">
            <Badge valor={s.status}>{ROTULO_STATUS_SOLICITACAO[s.status]}</Badge>
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
        {s.ata && (
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
      {s.motivoNegacao && (
        <>
          <div className="section-title">Motivo da Negação</div>
          <div className="error-banner">{s.motivoNegacao}</div>
        </>
      )}

      {/* GP: aprovar/negar */}
      {ehGP && (pendente || aguardandoAta) && s.tipo !== 'EMPRESTIMO' && (
        <div className="actions-box">
          <div className="actions-title">⚠️ Ações Disponíveis</div>
          {s.tipo === 'NOVO_ITEM' && (
            <>
              <div className="field">
                <label>Ata de registro de preços</label>
                <select value={ataId} onChange={(e) => setAtaId(e.target.value)}>
                  <option value="">
                    {aguardandoAta ? 'Selecione a ata...' : 'Sem ata disponível (aprovar aguardando ata)'}
                  </option>
                  {atas
                    .filter((a) => a.ativo)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.numero} — saldo {formatarMoeda(a.saldo)} — vence {formatarData(a.vencimento)}
                      </option>
                    ))}
                </select>
              </div>
              {ataId && (
                <div className="field">
                  <label>Valor estimado da aquisição (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                  />
                </div>
              )}
            </>
          )}
          {pendente && (
            <div className="field">
              <label>Motivo (obrigatório para negar)</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () =>
                    aguardandoAta
                      ? api.post(`/solicitacoes/${s.id}/vincular-ata`, {
                          ataId,
                          valorVinculado: Number(valor),
                        })
                      : api.post(`/solicitacoes/${s.id}/aprovar`, {
                          ...(ataId ? { ataId, valorVinculado: Number(valor) } : {}),
                        }),
                  'Solicitação aprovada.',
                )
              }
            >
              ✓ Aprovar {aguardandoAta ? 'e Vincular Ata' : 'Solicitação'}
            </button>
            {pendente && (
              <button
                className="btn btn-danger"
                onClick={() =>
                  executar(
                    () => api.post(`/solicitacoes/${s.id}/negar`, { motivo }),
                    'Solicitação negada.',
                  )
                }
              >
                ✕ Negar Solicitação
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cessão: origem confirma saída */}
      {s.tipo === 'CESSAO_USO' && s.status === 'AGUARDANDO_SAIDA' && ehOrigem && (
        <div className="actions-box">
          <div className="actions-title">Confirmar saída do equipamento</div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-saida`),
                  'Saída confirmada — aguardando recebimento pelo destino.',
                )
              }
            >
              ✓ Confirmar Saída
            </button>
          </div>
        </div>
      )}

      {/* Destino confirma recebimento (cessão/empréstimo) */}
      {s.status === 'AGUARDANDO_RECEBIMENTO' && ehDestino && (
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
                  'Recebimento confirmado.',
                )
              }
            >
              ✓ Confirmar Recebimento
            </button>
          </div>
        </div>
      )}

      {/* Empréstimo: origem confirma retorno */}
      {s.tipo === 'EMPRESTIMO' &&
        ['AGUARDANDO_RETORNO', 'AGUARDANDO_RECEBIMENTO'].includes(s.status) &&
        ehOrigem && (
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

      {/* Galpão: registrar entrada de novo item */}
      {ehGalpao && s.tipo === 'NOVO_ITEM' && s.status === 'APROVADA' && (
        <div className="actions-box">
          <div className="actions-title">Registrar entrada física e tombamento</div>
          {itens.map((item, i) => (
            <div key={i} className="info-grid" style={{ marginBottom: 0 }}>
              <div className="field">
                <label>Tombamento do item {i + 1} *</label>
                <input
                  value={item.tombamento}
                  onChange={(e) => {
                    const novos = [...itens];
                    novos[i] = { ...item, tombamento: e.target.value };
                    setItens(novos);
                  }}
                />
              </div>
              <div className="field">
                <label>Descrição *</label>
                <input
                  value={item.descricao}
                  onChange={(e) => {
                    const novos = [...itens];
                    novos[i] = { ...item, descricao: e.target.value };
                    setItens(novos);
                  }}
                />
              </div>
            </div>
          ))}
          {(s.quantidade ?? 1) > itens.length && (
            <button
              className="btn btn-outline btn-sm"
              style={{ marginBottom: 12 }}
              onClick={() =>
                setItens([...itens, { tombamento: '', descricao: '', estadoConservacao: 'BOM' }])
              }
            >
              + Adicionar item
            </button>
          )}
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/registrar-entrada`, { itens }),
                  'Entrada registrada e equipamentos cadastrados.',
                )
              }
            >
              ✓ Registrar Entrada
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

function NovaSolicitacao({
  onFechar,
  onSucesso,
}: {
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const [tipo, setTipo] = useState('NOVO_ITEM');
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    equipamentoId: '',
    unidadeDestinoId: '',
    tipoEquipamentoId: '',
    quantidade: 1,
    justificativa: '',
    origemRecurso: 'REGULAR',
    dataRetornoPrevista: '',
  };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    api.get<Equipamento[]>('/equipamentos?status=ATIVO').then(setEquipamentos).catch(() => {});
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/solicitacoes', {
        tipo,
        justificativa: form.justificativa,
        ...(tipo === 'NOVO_ITEM'
          ? {
              tipoEquipamentoId: form.tipoEquipamentoId,
              quantidade: Number(form.quantidade),
              origemRecurso: form.origemRecurso,
            }
          : { equipamentoId: form.equipamentoId }),
        ...(tipo === 'CESSAO_USO' || tipo === 'EMPRESTIMO'
          ? { unidadeDestinoId: form.unidadeDestinoId }
          : {}),
        ...(tipo === 'EMPRESTIMO' ? { dataRetornoPrevista: form.dataRetornoPrevista } : {}),
      });
      onSucesso();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo="Nova Solicitação" onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Tipo de Solicitação *</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(ROTULO_TIPO_SOLICITACAO).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {tipo === 'NOVO_ITEM' ? (
          <div className="info-grid">
            <div className="field">
              <label>Tipo de Equipamento *</label>
              <select
                value={form.tipoEquipamentoId}
                onChange={(e) => setForm({ ...form, tipoEquipamentoId: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {categorias.map((c) => (
                  <optgroup key={c.id} label={c.nome}>
                    {c.tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Quantidade *</label>
              <input
                type="number"
                min="1"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                required
              />
            </div>
            <div className="field">
              <label>Origem do Recurso *</label>
              <select
                value={form.origemRecurso}
                onChange={(e) => setForm({ ...form, origemRecurso: e.target.value })}
              >
                <option value="REGULAR">Regular</option>
                <option value="EMENDA_PARLAMENTAR">Emenda Parlamentar</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="info-grid">
            <div className="field">
              <label>Equipamento (do seu inventário) *</label>
              <select
                value={form.equipamentoId}
                onChange={(e) => setForm({ ...form, equipamentoId: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {equipamentos.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tombamento} — {eq.tipoEquipamento.nome}
                  </option>
                ))}
              </select>
            </div>
            {(tipo === 'CESSAO_USO' || tipo === 'EMPRESTIMO') && (
              <div className="field">
                <label>Unidade de Destino *</label>
                <select
                  value={form.unidadeDestinoId}
                  onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tipo === 'EMPRESTIMO' && (
              <div className="field">
                <label>Data Prevista de Retorno *</label>
                <input
                  type="date"
                  value={form.dataRetornoPrevista}
                  onChange={(e) => setForm({ ...form, dataRetornoPrevista: e.target.value })}
                  required
                />
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label>Justificativa *</label>
          <textarea
            rows={3}
            value={form.justificativa}
            onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
            required
          />
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            Enviar Solicitação
          </button>
        </div>
      </form>
    </Modal>
  );
}
