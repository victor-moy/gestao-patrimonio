import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, urlArquivo } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import { useAuth } from '../auth/AuthContext';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import type { Contrato, Equipamento, Manutencao } from '../types';
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  ROTULO_ESTADO,
  ROTULO_STATUS_MANUTENCAO,
} from '../utils/format';

export function Manutencoes() {
  const { usuario } = useAuth();
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroStatus) params.set('status', filtroStatus);
    api
      .get<Manutencao[]>(`/manutencoes?${params}`)
      .then(setManutencoes)
      .catch((e) => setErro(e.message));
  }, [busca, filtroStatus]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const detalhe = manutencoes.find((m) => m.id === detalheId) ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Manutenções</h2>
          <p className="count-sub">
            {manutencoes.length} solicitaç{manutencoes.length === 1 ? 'ão' : 'ões'} encontrada
            {manutencoes.length === 1 ? '' : 's'}
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
            placeholder="Buscar por equipamento, unidade, problema..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(ROTULO_STATUS_MANUTENCAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="request-list">
          {manutencoes.map((m) => (
            <div key={m.id} className="request-item" onClick={() => setDetalheId(m.id)}>
              <div>
                <div className="request-title">
                  {m.equipamento.tipoEquipamento?.nome ?? m.equipamento.descricao}
                  <span className="tomb">#{m.equipamento.tombamento}</span>
                </div>
                <div className="request-sub">{m.unidade.nome}</div>
                <div className="request-desc">{m.descricaoProblema}</div>
                <div className="request-meta">
                  <span>Solicitado em {formatarData(m.criadoEm)}</span>
                  <span>Por {m.solicitante.nome}</span>
                  {m.orcamentoValor && <span>Orçamento: {formatarMoeda(m.orcamentoValor)}</span>}
                </div>
              </div>
              <div>
                <Badge valor={m.status}>{ROTULO_STATUS_MANUTENCAO[m.status]}</Badge>
              </div>
            </div>
          ))}
          {manutencoes.length === 0 && (
            <div className="empty-state">Nenhuma manutenção encontrada</div>
          )}
        </div>
      </div>

      {detalhe && (
        <DetalheManutencao
          manutencao={detalhe}
          onFechar={() => setDetalheId(null)}
          onAtualizado={(msg) => {
            setDetalheId(null);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
      {novaAberta && (
        <NovaManutencao
          onFechar={() => setNovaAberta(false)}
          onSucesso={() => {
            setNovaAberta(false);
            setMensagem('Solicitação de manutenção registrada.');
            carregar();
          }}
        />
      )}
    </>
  );
}

function DetalheManutencao({
  manutencao,
  onFechar,
  onAtualizado,
}: {
  manutencao: Manutencao;
  onFechar: () => void;
  onAtualizado: (mensagem: string) => void;
}) {
  const { usuario } = useAuth();
  const [erro, setErro] = useMensagemTemporaria();
  const [motivo, setMotivo] = useState('');
  const [laudo, setLaudo] = useState<File | null>(null);
  const [orcamento, setOrcamento] = useState('');
  const [custoFinal, setCustoFinal] = useState('');
  const [estadoPos, setEstadoPos] = useState('BOM');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState('');

  const ehGM = usuario?.perfil === 'GESTOR_MANUTENCAO';
  const ehUnidadeDona = usuario?.perfil === 'UNIDADE' && usuario.unidadeId === manutencao.unidade.id;

  useEffect(() => {
    if (ehGM) api.get<Contrato[]>('/contratos').then(setContratos).catch(() => {});
  }, [ehGM]);

  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setErro(null);
    try {
      await acao();
      onAtualizado(mensagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  return (
    <Modal
      titulo="Detalhes da Manutenção de Equipamento"
      subtitulo={`#${manutencao.equipamento.tombamento} - ${manutencao.equipamento.tipoEquipamento?.nome ?? manutencao.equipamento.descricao}`}
      onFechar={onFechar}
    >
      {erro && <div className="error-banner toast-erro">{erro}</div>}
      <div className="info-grid">
        <div className="info-box">
          <div className="info-label">Unidade</div>
          <div className="info-value">{manutencao.unidade.nome}</div>
        </div>
        <div className="info-box">
          <div className="info-label">Solicitado em</div>
          <div className="info-value">{formatarDataHora(manutencao.criadoEm)}</div>
        </div>
        <div className="info-box">
          <div className="info-label">Status</div>
          <div className="info-value">
            <Badge valor={manutencao.status}>{ROTULO_STATUS_MANUTENCAO[manutencao.status]}</Badge>
          </div>
        </div>
        {manutencao.orcamentoValor && (
          <div className="info-box">
            <div className="info-label">Orçamento</div>
            <div className="info-value">{formatarMoeda(manutencao.orcamentoValor)}</div>
          </div>
        )}
      </div>

      <div className="section-title">Descrição do Problema</div>
      <div className="info-box" style={{ marginBottom: 14 }}>
        {manutencao.descricaoProblema}
      </div>
      <div className="section-title">Justificativa</div>
      <div className="info-box" style={{ marginBottom: 14 }}>
        {manutencao.justificativa}
      </div>
      {manutencao.motivoNegacao && (
        <>
          <div className="section-title">Motivo da Negação</div>
          <div className="error-banner">{manutencao.motivoNegacao}</div>
        </>
      )}
      {manutencao.laudoBaixa && (
        <>
          <div className="section-title">Laudo de Baixa</div>
          <div className="error-banner">
            <a href={urlArquivo(manutencao.laudoBaixa)} target="_blank" rel="noreferrer">
              Ver laudo em PDF
            </a>
          </div>
        </>
      )}

      {/* Ações por status e perfil */}
      {ehGM && manutencao.status === 'PENDENTE_APROVACAO' && (
        <div className="actions-box">
          <div className="actions-title">⚠️ Ações Disponíveis</div>
          {contratos.length > 0 && (
            <div className="field">
              <label>Contrato da terceirizada</label>
              <select value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                <option value="">Selecionar depois</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.empresa}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Motivo (obrigatório para negar)</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(
                  () =>
                    api.post(`/manutencoes/${manutencao.id}/aprovar`, contratoId ? { contratoId } : {}),
                  'Manutenção aprovada.',
                )
              }
            >
              ✓ Aprovar Solicitação
            </button>
            <button
              className="btn btn-danger"
              onClick={() =>
                executar(
                  () => api.post(`/manutencoes/${manutencao.id}/negar`, { motivo }),
                  'Manutenção negada.',
                )
              }
            >
              ✕ Negar Solicitação
            </button>
          </div>
        </div>
      )}

      {ehGM && manutencao.status === 'AGUARDANDO_ORCAMENTO' && (
        <div className="actions-box">
          <div className="actions-title">Registrar orçamento da terceirizada</div>
          <div className="field">
            <label>Valor do orçamento (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={orcamento}
              onChange={(e) => setOrcamento(e.target.value)}
            />
          </div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/manutencoes/${manutencao.id}/orcamento`, { valor: Number(orcamento) }),
                  'Orçamento registrado.',
                )
              }
            >
              Registrar Orçamento
            </button>
          </div>
        </div>
      )}

      {ehGM && manutencao.status === 'ORCAMENTO_REGISTRADO' && (
        <div className="actions-box">
          <div className="actions-title">Validar orçamento ({formatarMoeda(manutencao.orcamentoValor)})</div>
          <div className="field">
            <label>Laudo de baixa em PDF (obrigatório para rejeitar)</label>
            <input type="file" accept="application/pdf" onChange={(e) => setLaudo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              onClick={() =>
                executar(async () => {
                  const dados = new FormData();
                  dados.append('aprovado', 'true');
                  await api.post(`/manutencoes/${manutencao.id}/validar-orcamento`, dados);
                }, 'Orçamento aprovado — manutenção em execução.')
              }
            >
              ✓ Aprovar Orçamento
            </button>
            <button
              className="btn btn-danger"
              disabled={!laudo}
              onClick={() =>
                executar(async () => {
                  const dados = new FormData();
                  dados.append('aprovado', 'false');
                  if (laudo) dados.append('laudo', laudo);
                  await api.post(`/manutencoes/${manutencao.id}/validar-orcamento`, dados);
                }, 'Orçamento rejeitado — laudo de baixa emitido e solicitação de substituição aberta automaticamente.')
              }
            >
              ✕ Rejeitar e Emitir Baixa
            </button>
          </div>
        </div>
      )}

      {ehGM && manutencao.status === 'EM_EXECUCAO' && (
        <div className="actions-box">
          <div className="actions-title">Registrar retorno da terceirizada</div>
          <div className="field">
            <label>Custo final (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={manutencao.orcamentoValor ?? ''}
              value={custoFinal}
              onChange={(e) => setCustoFinal(e.target.value)}
            />
          </div>
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () =>
                    api.post(`/manutencoes/${manutencao.id}/registrar-retorno`, {
                      ...(custoFinal ? { custoFinal: Number(custoFinal) } : {}),
                    }),
                  'Retorno registrado — aguardando confirmação dupla.',
                )
              }
            >
              Equipamento Retornou
            </button>
            <button
              className="btn btn-danger"
              disabled={!laudo}
              onClick={() =>
                executar(async () => {
                  const dados = new FormData();
                  if (laudo) dados.append('laudo', laudo);
                  await api.post(`/manutencoes/${manutencao.id}/baixa`, dados);
                }, 'Laudo de baixa emitido.')
              }
            >
              Emitir Laudo de Baixa
            </button>
          </div>
        </div>
      )}

      {manutencao.status === 'AGUARDANDO_RETORNO' && (ehGM || ehUnidadeDona) && (
        <div className="actions-box">
          <div className="actions-title">
            Confirmação dupla de retorno — Unidade: {manutencao.confirmadoUnidade ? '✓' : 'pendente'} ·
            Gestor: {manutencao.confirmadoGestor ? '✓' : 'pendente'}
          </div>
          <div className="field">
            <label>Estado do equipamento pós-manutenção</label>
            <select value={estadoPos} onChange={(e) => setEstadoPos(e.target.value)}>
              {Object.entries(ROTULO_ESTADO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="actions-row">
            <button
              className="btn btn-success"
              disabled={(ehGM && manutencao.confirmadoGestor) || (ehUnidadeDona && manutencao.confirmadoUnidade)}
              onClick={() =>
                executar(
                  () =>
                    api.post(`/manutencoes/${manutencao.id}/confirmar-retorno`, {
                      estadoPosManutencao: estadoPos,
                    }),
                  'Retorno confirmado.',
                )
              }
            >
              ✓ Confirmar Retorno
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NovaManutencao({
  onFechar,
  onSucesso,
}: {
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = { equipamentoId: '', descricaoProblema: '', justificativa: '' };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    // A unidade só vê o próprio inventário; somente equipamentos ativos
    api
      .get<Equipamento[]>('/equipamentos?status=ATIVO')
      .then(setEquipamentos)
      .catch(() => {});
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/manutencoes', form);
      onSucesso();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo="Nova Solicitação de Manutenção" onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Equipamento *</label>
          <select
            value={form.equipamentoId}
            onChange={(e) => setForm({ ...form, equipamentoId: e.target.value })}
            required
          >
            <option value="">Selecione o equipamento...</option>
            {equipamentos.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.tombamento} — {eq.tipoEquipamento.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Descrição do Problema *</label>
          <textarea
            rows={3}
            value={form.descricaoProblema}
            onChange={(e) => setForm({ ...form, descricaoProblema: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Justificativa *</label>
          <textarea
            rows={2}
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
