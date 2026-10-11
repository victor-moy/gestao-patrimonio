import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { LinkArquivoProtegido } from '../components/ArquivoProtegido';
import { useAuth } from '../auth/AuthContext';
import { corDoStatus } from '../components/Badge';
import { CampoAnexo } from '../components/CampoAnexo';
import { caminhoConversa } from '../utils/conversas';
import { HistoricoRecolhivel } from '../components/HistoricoRecolhivel';
import type { Contrato, EventoManutencao, Manutencao } from '../types';
import {
  formatarDataHora,
  formatarMoeda,
  ROTULO_ESTADO,
  ROTULO_STATUS_MANUTENCAO,
  codigoManutencao,
} from '../utils/format';
import { nomeEquipamento, rotuloEventoManutencao } from '../utils/manutencao';
import './Solicitacoes.css';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { EsqueletoDetalhe } from '../components/Esqueletos';

export function ManutencaoDetalhe() {
  const { id } = useParams();
  const [manutencao, setManutencao] = useState<Manutencao | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [historico, setHistorico] = useState<EventoManutencao[] | null>(null);
  const [falhaHistorico, setFalhaHistorico] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setFalha(null);
    api
      .get<Manutencao>(`/manutencoes/${id}`)
      .then((dados) => {
        if (idRequisicao === requisicao.current) setManutencao(dados);
      })
      .catch((e) => {
        if (idRequisicao === requisicao.current) {
          setFalha(e instanceof Error ? e.message : 'Não foi possível carregar a manutenção.');
        }
      });
    // O histórico é complementar: se falhar, a página segue funcionando
    api
      .get<EventoManutencao[]>(`/manutencoes/${id}/historico`)
      .then((eventos) => {
        if (idRequisicao !== requisicao.current) return;
        setHistorico(Array.isArray(eventos) ? eventos : []);
        setFalhaHistorico(false);
      })
      .catch(() => {
        if (idRequisicao === requisicao.current) setFalhaHistorico(true);
      });
  }, [id]);

  useEffect(() => {
    setManutencao(null);
    setHistorico(null);
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  if (falha) {
    return (
      <section className="gestao-page equipamento-pagina">
        <div className="error-banner" role="alert">{falha}</div>
        <button type="button" className="btn btn-outline" onClick={carregar}>
          Tentar novamente
        </button>
      </section>
    );
  }

  if (!manutencao) {
    return <EsqueletoDetalhe rotulo="Carregando manutenção…" />;
  }

  return (
    <ConteudoManutencao
      manutencao={manutencao}
      historico={historico}
      falhaHistorico={falhaHistorico}
      onAtualizado={() => carregar()}
    />
  );
}

type Acao = 'aprovar' | 'negar' | 'retorno' | 'baixa' | 'rejeitar';

// Campos que expandem/recolhem sem desmontar — evita o "pulo" ao abrir a ação.
function Expansivel({ aberto, children }: { aberto: boolean; children: ReactNode }) {
  return (
    <div
      className={`actions-expand${aberto ? ' aberto' : ''}`}
      {...(aberto ? {} : ({ inert: '' } as object))}
    >
      <div>{children}</div>
    </div>
  );
}

function ConteudoManutencao({
  manutencao: m,
  historico,
  falhaHistorico,
  onAtualizado,
}: {
  manutencao: Manutencao;
  historico: EventoManutencao[] | null;
  falhaHistorico: boolean;
  onAtualizado: () => void;
}) {
  const { usuario } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));
  const [ocupado, setOcupado] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  // Conteúdo mantido durante a animação de recolher (acao zera antes)
  const [acaoExibida, setAcaoExibida] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState('');
  const [laudo, setLaudo] = useState<File | null>(null);
  const [orcamento, setOrcamento] = useState('');
  const [custoFinal, setCustoFinal] = useState('');
  const [estadoPos, setEstadoPos] = useState('BOM');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState('');

  const ehGM = usuario?.perfil === 'GESTOR_MANUTENCAO';
  const ehUnidadeDona = usuario?.perfil === 'UNIDADE' && usuario.unidadeId === m.unidade.id;
  const nome = nomeEquipamento(m);
  // Só mostra a confirmação enquanto o lado de quem está vendo ainda não confirmou
  const podeConfirmarRetorno = (ehGM && !m.confirmadoGestor) || (ehUnidadeDona && !m.confirmadoUnidade);

  useEffect(() => {
    if (ehGM) {
      api
        .get<Contrato[]>('/contratos')
        .then(setContratos)
        .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os contratos.'));
    }
  }, [ehGM, setErro]);

  // A página fica aberta entre uma ação e outra: ao mudar o status, os formulários
  // de ação voltam ao estado inicial.
  useEffect(() => {
    setAcao(null);
    setMotivo('');
    setLaudo(null);
    setOrcamento('');
    setCustoFinal('');
    setContratoId('');
  }, [m.status]);

  useEffect(() => {
    if (!acao) return;
    const alvo = { aprovar: 'man-contrato', negar: 'man-motivo', retorno: 'man-custo', baixa: '', rejeitar: '' }[acao];
    if (alvo) document.getElementById(alvo)?.focus({ preventScroll: true });
  }, [acao]);

  async function executar(operacao: () => Promise<unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      await operacao();
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado(false);
    }
  }

  function abrir(proxima: Acao) {
    setAcaoExibida(proxima);
    setAcao(proxima);
  }

  const aprovar = () =>
    executar(
      () => api.post(`/manutencoes/${m.id}/aprovar`, contratoId ? { contratoId } : {}),
    );

  const enviarLaudo = async (caminho: string, extra?: Record<string, string>) => {
    const dados = new FormData();
    Object.entries(extra ?? {}).forEach(([chave, valor]) => dados.append(chave, valor));
    if (laudo) dados.append('laudo', laudo);
    await api.post(`/manutencoes/${m.id}/${caminho}`, dados);
  };

  const campoLaudo = (
    <div className="field">
      <span id="man-laudo-rotulo" className="rotulo-campo">
        Laudo de baixa (PDF) *
      </span>
      <CampoAnexo
        arquivo={laudo}
        preview={null}
        onSelecionar={setLaudo}
        onRemover={() => setLaudo(null)}
        accept="application/pdf"
        dica="PDF até 5MB"
      />
    </div>
  );

  const rotuloSimNao = (confirmado: boolean) => (confirmado ? 'Confirmado' : 'Pendente');

  return (
    <section className="gestao-page equipamento-pagina" aria-labelledby="manutencao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="manutencao-titulo">{nome}</h2>
          <span className="req-numero req-numero--titulo" aria-label={`Número ${codigoManutencao(m.numero)}`}>{codigoManutencao(m.numero)}</span>
          <span className={`inventario-status inventario-status--tom-${corDoStatus(m.status)}`}>
            <span aria-hidden />
            {ROTULO_STATUS_MANUTENCAO[m.status]}
          </span>
        </div>
        <div className="inventario-lista-acoes">
          <Link className="btn btn-outline" to={caminhoConversa('manutencao', m.id)}>
            Conversar
          </Link>
        </div>
      </div>


      <div className="solicitacao-layout">
        <section className="equipamento-secao solicitacao-informacoes">
          <h3>Informações da manutenção</h3>
          <dl className="equipamento-dados">
            <div>
              <dt>Tombamento</dt>
              <dd>{m.equipamento.tombamento}</dd>
            </div>
            <div>
              <dt>Solicitado em</dt>
              <dd>{formatarDataHora(m.criadoEm)}</dd>
            </div>
            <div>
              <dt>Solicitado por</dt>
              <dd>{m.solicitante.nome}</dd>
            </div>
            {m.contrato && (
              <div>
                <dt>Contrato</dt>
                <dd>{m.contrato.empresa}</dd>
              </div>
            )}
            {m.orcamentoValor && (
              <div>
                <dt>Orçamento</dt>
                <dd>{formatarMoeda(m.orcamentoValor)}</dd>
              </div>
            )}
            {m.custoFinal && (
              <div>
                <dt>Custo final</dt>
                <dd>{formatarMoeda(m.custoFinal)}</dd>
              </div>
            )}
            {m.status === 'AGUARDANDO_RETORNO' && (
              <>
                <div>
                  <dt>Confirmação da unidade</dt>
                  <dd>{rotuloSimNao(m.confirmadoUnidade)}</dd>
                </div>
                <div>
                  <dt>Confirmação do gestor</dt>
                  <dd>{rotuloSimNao(m.confirmadoGestor)}</dd>
                </div>
              </>
            )}
            {m.dataConclusao && (
              <div>
                <dt>Concluída em</dt>
                <dd>{formatarDataHora(m.dataConclusao)}</dd>
              </div>
            )}
          </dl>
        </section>

        <aside className="solicitacao-resumo" aria-label="Resumo da manutenção">
          <section className="equipamento-secao">
            <h3>Localização</h3>
            <dl className="equipamento-dados equipamento-dados--lateral">
              <div>
                <dt>Unidade</dt>
                <dd>{m.unidade.nome}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <div className="solicitacao-textos">
          <section className="equipamento-secao solicitacao-secao-texto">
            <h3>Descrição do problema</h3>
            <p>{m.descricaoProblema}</p>
          </section>

          {m.justificativa && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Justificativa</h3>
              <p>{m.justificativa}</p>
            </section>
          )}

          {m.motivoNegacao && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Motivo da negação</h3>
              <p>{m.motivoNegacao}</p>
            </section>
          )}

          {m.laudoBaixa && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Laudo de baixa</h3>
              <LinkArquivoProtegido caminho={m.laudoBaixa}>Ver laudo em PDF</LinkArquivoProtegido>
            </section>
          )}

          <HistoricoRecolhivel id="historico-manutencao">
            {falhaHistorico && !historico ? (
              <div className="equipamento-historico-vazio" role="status">
                Não foi possível carregar o histórico.
              </div>
            ) : !historico ? (
              <div className="equipamento-historico-vazio" role="status">
                Carregando histórico…
              </div>
            ) : (
              <ol className="equipamento-historico historico-lista">
                {historico.map((evento) => (
                  <li className="equipamento-evento" key={evento.id}>
                    <div>
                      <strong>{rotuloEventoManutencao(evento)}</strong>
                      <p>
                        {evento.usuario ? `${evento.usuario} · ` : ''}
                        <time dateTime={evento.criadoEm}>{formatarDataHora(evento.criadoEm)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </HistoricoRecolhivel>
        </div>

        <div className="solicitacao-lateral">
          <div className="solicitacao-acoes">
            {/* Gestor de Manutenção: aprovar (contrato opcional) ou negar (motivo obrigatório) */}
            {ehGM && m.status === 'PENDENTE_APROVACAO' && (
              <div className="actions-box actions-box--simples">
                <Expansivel aberto={acao === 'aprovar' || acao === 'negar'}>
                  {acaoExibida === 'aprovar' && contratos.length > 0 && (
                    <div className="field">
                      <label htmlFor="man-contrato">Contrato da terceirizada</label>
                      <select id="man-contrato" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                        <option value="">Selecionar depois</option>
                        {contratos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.empresa}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {acaoExibida === 'negar' && (
                    <div className="field">
                      <label htmlFor="man-motivo">Motivo da negação *</label>
                      <input id="man-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    </div>
                  )}
                </Expansivel>
                <div className="actions-row">
                  {acao === null || (acao !== 'aprovar' && acao !== 'negar') ? (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => abrir('negar')}>
                        Negar manutenção
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado}
                        onClick={() => (contratos.length > 0 ? abrir('aprovar') : aprovar())}
                      >
                        Aprovar manutenção
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => setAcao(null)}>
                        Cancelar
                      </button>
                      {acao === 'aprovar' ? (
                        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={aprovar}>
                          Confirmar aprovação
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={ocupado || !motivo.trim()}
                          onClick={() =>
                            executar(() => api.post(`/manutencoes/${m.id}/negar`, { motivo }))
                          }
                        >
                          Confirmar negação
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {ehGM && m.status === 'AGUARDANDO_ORCAMENTO' && (
              <div className="actions-box">
                <div className="actions-title">Registrar orçamento</div>
                <div className="field">
                  <label htmlFor="man-orcamento">Valor do orçamento (R$) *</label>
                  <input
                    id="man-orcamento"
                    type="number"
                    step="0.01"
                    min="0"
                    value={orcamento}
                    onChange={(e) => setOrcamento(e.target.value)}
                  />
                </div>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado || orcamento === ''}
                    onClick={() =>
                      executar(
                        () => api.post(`/manutencoes/${m.id}/orcamento`, { valor: Number(orcamento) }),
                      )
                    }
                  >
                    Registrar orçamento
                  </button>
                </div>
              </div>
            )}

            {/* Validação do orçamento: aprovar direto ou rejeitar anexando o laudo de baixa */}
            {ehGM && m.status === 'ORCAMENTO_REGISTRADO' && (
              <div className="actions-box actions-box--simples">
                <Expansivel aberto={acao === 'rejeitar'}>{acaoExibida === 'rejeitar' && campoLaudo}</Expansivel>
                <div className="actions-row">
                  {acao !== 'rejeitar' ? (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => abrir('rejeitar')}>
                        Rejeitar orçamento
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado}
                        onClick={() =>
                          executar(
                            () => enviarLaudo('validar-orcamento', { aprovado: 'true' }),
                          )
                        }
                      >
                        Aprovar orçamento
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => setAcao(null)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado || !laudo}
                        onClick={() =>
                          executar(
                            () => enviarLaudo('validar-orcamento', { aprovado: 'false' }),
                          )
                        }
                      >
                        Confirmar rejeição
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Em execução: registrar o retorno (custo final) ou emitir laudo de baixa */}
            {ehGM && m.status === 'EM_EXECUCAO' && (
              <div className="actions-box actions-box--simples">
                <Expansivel aberto={acao === 'retorno' || acao === 'baixa'}>
                  {acaoExibida === 'retorno' && (
                    <div className="field">
                      <label htmlFor="man-custo">Custo final (R$)</label>
                      <input
                        id="man-custo"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={m.orcamentoValor ?? ''}
                        value={custoFinal}
                        onChange={(e) => setCustoFinal(e.target.value)}
                      />
                    </div>
                  )}
                  {acaoExibida === 'baixa' && campoLaudo}
                </Expansivel>
                <div className="actions-row">
                  {acao !== 'retorno' && acao !== 'baixa' ? (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => abrir('baixa')}>
                        Emitir laudo de baixa
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => abrir('retorno')}>
                        Equipamento retornou
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => setAcao(null)}>
                        Cancelar
                      </button>
                      {acao === 'retorno' ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={ocupado}
                          onClick={() =>
                            executar(
                              () =>
                                api.post(`/manutencoes/${m.id}/registrar-retorno`, {
                                  ...(custoFinal ? { custoFinal: Number(custoFinal) } : {}),
                                }),
                            )
                          }
                        >
                          Confirmar retorno
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={ocupado || !laudo}
                          onClick={() => executar(() => enviarLaudo('baixa'))}
                        >
                          Emitir laudo
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Confirmação dupla do retorno: Unidade e Gestor de Manutenção */}
            {m.status === 'AGUARDANDO_RETORNO' && podeConfirmarRetorno && (
              <div className="actions-box">
                <div className="actions-title">Confirmar retorno</div>
                <div className="field">
                  <label htmlFor="man-estado">Estado do equipamento pós-manutenção</label>
                  <select id="man-estado" value={estadoPos} onChange={(e) => setEstadoPos(e.target.value)}>
                    {Object.entries(ROTULO_ESTADO).map(([valor, rotulo]) => (
                      <option key={valor} value={valor}>
                        {rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="actions-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado}
                    onClick={() =>
                      executar(
                        () => api.post(`/manutencoes/${m.id}/confirmar-retorno`, { estadoPosManutencao: estadoPos }),
                      )
                    }
                  >
                    Confirmar retorno
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
