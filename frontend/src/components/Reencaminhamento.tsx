import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { CampoAnexo } from './CampoAnexo';
import { StatusPill } from './StatusPill';
import type { CategoriaProblemaCivil, EtapaDoCaso, Equipamento, Manutencao, TipoManutencao } from '../types';
import { codigoManutencao, formatarDataHora, ROTULO_STATUS_MANUTENCAO } from '../utils/format';
import { ROTULO_CATEGORIA_CIVIL } from '../utils/manutencao';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 500;

// Em quais status quem atende ainda pode pedir para passar o chamado adiante (espelha o backend)
const STATUS_QUE_PODEM_PEDIR = ['AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'AGUARDANDO_EXECUCAO', 'EM_EXECUCAO'];

// Só a terceirizada do contrato pede, e só enquanto o chamado está com ela
export const podeReencaminhar = (m: Manutencao, ehTerceirizada: boolean) =>
  ehTerceirizada && STATUS_QUE_PODEM_PEDIR.includes(m.status);

// Motivo escrito por quem atendia: fica visível enquanto o reencaminhamento aguarda decisão
export function MotivoReencaminhamento({ m }: { m: Manutencao }) {
  if (m.status !== 'REENCAMINHAMENTO_SOLICITADO' || !m.motivoReencaminhamento) return null;
  return (
    <section className="equipamento-secao solicitacao-secao-texto">
      <h3>Reencaminhamento solicitado</h3>
      <p>{m.motivoReencaminhamento}</p>
    </section>
  );
}

// Trajetória do caso: todos os atendimentos ligados por reencaminhamento, do primeiro ao mais recente.
// Só aparece quando há mais de um (chamado comum não mostra nada).
export function TrajetoriaCaso({ manutencaoId, status }: { manutencaoId: string; status: string }) {
  const [etapas, setEtapas] = useState<EtapaDoCaso[] | null>(null);
  const [falha, setFalha] = useState(false);

  const carregar = useCallback(() => {
    setFalha(false);
    api
      .get<EtapaDoCaso[]>(`/manutencoes/${manutencaoId}/trajetoria`)
      .then((lista) => setEtapas(Array.isArray(lista) ? lista : []))
      .catch(() => setFalha(true));
  }, [manutencaoId]);

  // Recarrega quando o status muda: reencaminhar cria um novo atendimento na cadeia
  useEffect(() => {
    carregar();
  }, [carregar, status]);

  if (falha) {
    return (
      <section className="equipamento-secao solicitacao-secao-texto">
        <h3>Trajetória do caso</h3>
        <div className="error-banner" role="alert">
          Não foi possível carregar a trajetória.
        </div>
        <button type="button" className="btn btn-outline" onClick={carregar}>
          Tentar novamente
        </button>
      </section>
    );
  }
  if (!etapas || etapas.length < 2) return null;

  return (
    <section className="equipamento-secao solicitacao-secao-texto" aria-labelledby="trajetoria-titulo">
      <h3 id="trajetoria-titulo">Trajetória do caso</h3>
      <ol className="trajetoria-lista">
        {etapas.map((e) => {
          const rotulo = codigoManutencao(e.numero);
          const detalhe = [e.titulo, e.prestador, `aberto em ${formatarDataHora(e.criadoEm)}`].filter(Boolean).join(' · ');
          return (
            <li key={e.id} className={`trajetoria-etapa${e.atual ? ' trajetoria-etapa--atual' : ''}`} aria-current={e.atual ? 'step' : undefined}>
              <div className="trajetoria-cabecalho">
                {e.acessivel && !e.atual ? (
                  <Link to={`/manutencoes/${e.id}`} className="trajetoria-numero">
                    {rotulo}
                  </Link>
                ) : (
                  <span className="trajetoria-numero">{rotulo}</span>
                )}
                <StatusPill valor={e.status}>{ROTULO_STATUS_MANUTENCAO[e.status]}</StatusPill>
              </div>
              <p className="trajetoria-detalhe">{detalhe}</p>
              {e.motivoReencaminhamento && <p className="trajetoria-motivo">Motivo do reencaminhamento: {e.motivoReencaminhamento}</p>}
              {e.baixa && <p className="trajetoria-detalhe">Baixa e substituição: SOL-{String(e.baixa.numero).padStart(4, '0')}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type Destino = 'manutencao' | 'baixa';

// Ações do reencaminhamento, por perfil e etapa: pedir (quem atende), confirmar e decidir o destino (Administrador)
export function AcoesReencaminhamento({
  m,
  executar,
  ocupado,
  ehAdministrador,
  ehTerceirizada,
}: {
  m: Manutencao;
  executar: Executar;
  ocupado: boolean;
  ehAdministrador: boolean;
  ehTerceirizada: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState<Destino>('manutencao');
  const [tipoNovo, setTipoNovo] = useState<TipoManutencao>(m.tipo);
  const [equipamentoId, setEquipamentoId] = useState('');
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [falhaEquipamentos, setFalhaEquipamentos] = useState<string | null>(null);
  const [local, setLocal] = useState('');
  const [categoria, setCategoria] = useState<CategoriaProblemaCivil | ''>('');
  const [laudo, setLaudo] = useState<File | null>(null);

  const decidindo = ehAdministrador && m.status === 'REENCAMINHAMENTO_SOLICITADO' && !!m.reencaminhamentoConfirmadoEm;
  const confirmando = ehAdministrador && m.status === 'REENCAMINHAMENTO_SOLICITADO' && !m.reencaminhamentoConfirmadoEm;
  const podePedir = podeReencaminhar(m, ehTerceirizada);
  const precisaEscolherEquipamento = decidindo && destino === 'manutencao' && tipoNovo === 'EQUIPAMENTO' && !m.equipamento;
  const precisaDadosCivis = decidindo && destino === 'manutencao' && tipoNovo === 'CIVIL' && (!m.localAfetado || !m.categoriaCivil);

  // Ao mudar de etapa, os formulários voltam ao início
  useEffect(() => {
    setMotivo('');
    setDestino('manutencao');
    setTipoNovo(m.tipo);
    setEquipamentoId('');
    setLocal('');
    setCategoria('');
    setLaudo(null);
  }, [m.status, m.tipo]);

  useEffect(() => {
    if (!precisaEscolherEquipamento) return;
    setFalhaEquipamentos(null);
    api
      .get<Equipamento[]>(`/equipamentos?status=ATIVO&unidadeId=${m.unidade.id}`)
      .then((lista) => setEquipamentos(Array.isArray(lista) ? lista : []))
      .catch((e) => setFalhaEquipamentos(e instanceof Error ? e.message : 'Não foi possível carregar os equipamentos.'));
  }, [precisaEscolherEquipamento, m.unidade.id]);

  const motivoValido = motivo.trim().length >= MOTIVO_MIN;
  const novoChamadoCompleto =
    (!precisaEscolherEquipamento || equipamentoId !== '') && (!precisaDadosCivis || (local.trim().length >= 2 && categoria !== ''));
  const baixaPossivel = !!m.equipamento;

  const decidir = () =>
    executar(async () => {
      if (destino === 'baixa') {
        const dados = new FormData();
        if (laudo) dados.append('laudo', laudo);
        await api.post(`/manutencoes/${m.id}/reencaminhar/baixa`, dados);
        return;
      }
      await api.post(`/manutencoes/${m.id}/reencaminhar/manutencao`, {
        tipo: tipoNovo,
        ...(precisaEscolherEquipamento ? { equipamentoId } : {}),
        ...(precisaDadosCivis ? { localAfetado: local.trim(), categoriaCivil: categoria } : {}),
      });
    });

  return (
    <>
      {podePedir && (
        <div className="actions-box">
          <div className="actions-title">Reencaminhar chamado</div>
          <p className="itens-aviso">O Administrador decide o destino do chamado.</p>
          <div className="field">
            <label htmlFor="reenc-motivo">Motivo do reencaminhamento *</label>
            <input
              id="reenc-motivo"
              maxLength={MOTIVO_MAX}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="actions-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || !motivoValido}
              onClick={() => executar(() => api.post(`/manutencoes/${m.id}/solicitar-reencaminhamento`, { motivo: motivo.trim() }))}
            >
              Reencaminhar
            </button>
          </div>
        </div>
      )}

      {confirmando && (
        <div className="actions-box">
          <div className="actions-title">Reencaminhamento solicitado</div>
          <p className="itens-aviso">Leia o motivo acima e confirme para escolher o que fazer com o chamado.</p>
          <div className="actions-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado}
              onClick={() => executar(() => api.post(`/manutencoes/${m.id}/confirmar-reencaminhamento`))}
            >
              Confirmar reencaminhamento
            </button>
          </div>
        </div>
      )}

      {decidindo && (
        <div className="actions-box">
          <div className="actions-title">Decidir o destino do chamado</div>
          <div className="field">
            <label htmlFor="reenc-destino">O que fazer *</label>
            <select id="reenc-destino" value={destino} onChange={(e) => setDestino(e.target.value as Destino)}>
              <option value="manutencao">Abrir novo chamado de manutenção</option>
              <option value="baixa" disabled={!baixaPossivel}>
                Baixar o equipamento (Patrimônio)
              </option>
            </select>
            {!baixaPossivel && <p className="itens-aviso itens-aviso--acao">A baixa só vale para chamado de equipamento.</p>}
          </div>

          {destino === 'manutencao' && (
            <>
              <div className="field">
                <label htmlFor="reenc-tipo">Tipo do novo chamado</label>
                <select id="reenc-tipo" value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoManutencao)}>
                  <option value="EQUIPAMENTO">Manutenção de equipamento</option>
                  <option value="CIVIL">Manutenção civil</option>
                </select>
                <p className="itens-aviso itens-aviso--acao">
                  O novo chamado vai para a triagem, sem prestador: você escolhe o item de contrato ao encaminhá-lo.
                </p>
              </div>
              {precisaEscolherEquipamento && (
                <div className="field">
                  <label htmlFor="reenc-equipamento">Equipamento *</label>
                  <select id="reenc-equipamento" value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {equipamentos.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.tipoEquipamento?.nome ?? eq.descricao} · {eq.tombamento}
                      </option>
                    ))}
                  </select>
                  {falhaEquipamentos && (
                    <p className="itens-aviso itens-aviso--acao" role="alert">
                      {falhaEquipamentos}
                    </p>
                  )}
                </div>
              )}
              {precisaDadosCivis && (
                <>
                  <div className="field">
                    <label htmlFor="reenc-local">Local afetado *</label>
                    <input id="reenc-local" maxLength={200} value={local} onChange={(e) => setLocal(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="reenc-categoria">Tipo de problema *</label>
                    <select id="reenc-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProblemaCivil | '')}>
                      <option value="">Selecione…</option>
                      {Object.entries(ROTULO_CATEGORIA_CIVIL).map(([chave, rotulo]) => (
                        <option key={chave} value={chave}>
                          {rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </>
          )}

          {destino === 'baixa' && (
            <div className="laudo-baixa" role="group" aria-labelledby="reenc-laudo-rotulo">
              <div id="reenc-laudo-rotulo" className="laudo-baixa-titulo">
                Laudo de baixa (PDF) *
              </div>
              <p className="laudo-baixa-ajuda">
                O equipamento será baixado e uma solicitação de substituição será aberta automaticamente.
              </p>
              <CampoAnexo arquivo={laudo} preview={null} onSelecionar={setLaudo} onRemover={() => setLaudo(null)} accept="application/pdf" dica="PDF até 5MB" />
            </div>
          )}

          <div className="actions-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || (destino === 'baixa' ? !laudo : !novoChamadoCompleto)}
              onClick={decidir}
            >
              {destino === 'baixa' ? 'Confirmar baixa' : 'Abrir novo chamado'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
