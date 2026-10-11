import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { caminhoConversa } from '../utils/conversas';
import { HistoricoRecolhivel } from '../components/HistoricoRecolhivel';
import './Solicitacoes.css';
import { api } from '../api/client';
import { ImagemProtegida, LinkArquivoProtegido } from '../components/ArquivoProtegido';
import { useAuth } from '../auth/AuthContext';
import { corDoStatus } from '../components/Badge';
import type { EventoSolicitacao, Solicitacao } from '../types';
import { codigoSolicitacao, formatarData, formatarDataHora, formatarMoeda, ROTULO_TIPO_SOLICITACAO } from '../utils/format';
import { nomeItem, rotuloEvento, statusExibido, TIPOS_COM_ATA } from '../utils/solicitacao';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { EsqueletoDetalhe } from '../components/Esqueletos';

export function SolicitacaoDetalhe() {
  const { id } = useParams();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [historico, setHistorico] = useState<EventoSolicitacao[] | null>(null);
  const [falhaHistorico, setFalhaHistorico] = useState(false);
  const requisicao = useRef(0);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setFalha(null);
    api
      .get<Solicitacao>(`/solicitacoes/${id}`)
      .then((dados) => {
        if (idRequisicao === requisicao.current) setSolicitacao(dados);
      })
      .catch((e) => {
        if (idRequisicao === requisicao.current) {
          setFalha(e instanceof Error ? e.message : 'Não foi possível carregar a solicitação.');
        }
      });
    // O histórico é complementar: se falhar, a página segue funcionando
    api
      .get<EventoSolicitacao[]>(`/solicitacoes/${id}/historico`)
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
    setSolicitacao(null);
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

  if (!solicitacao) {
    return <EsqueletoDetalhe rotulo="Carregando solicitação…" />;
  }

  return (
    <ConteudoSolicitacao
      solicitacao={solicitacao}
      historico={historico}
      falhaHistorico={falhaHistorico}
      onAtualizado={() => {
        // Segue na página — dá pra continuar o fluxo (aprovar → reservar →
        // lançar no Branet...) sem reabrir a cada passo
        carregar();
      }}
    />
  );
}

function ConteudoSolicitacao({
  solicitacao: s,
  historico,
  falhaHistorico,
  onAtualizado,
}: {
  solicitacao: Solicitacao;
  historico: EventoSolicitacao[] | null;
  falhaHistorico: boolean;
  onAtualizado: () => void;
}) {
  const { usuario } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));
  const [motivo, setMotivo] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [acaoPendente, setAcaoPendente] = useState<'aprovar' | 'negar' | null>(null);
  // Conteúdo mantido durante a animação de recolher (acaoPendente zera antes)
  const [acaoExibida, setAcaoExibida] = useState<'aprovar' | 'negar' | null>(null);
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

  // A página fica aberta entre uma ação e outra (feedback 18/08 — não precisa
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

  // O ajuste de tombamento não muda o status, então o efeito acima não roda:
  // sincroniza os campos com os tombamentos recarregados do servidor.
  const chaveItensGerados = (s.itensGerados ?? []).map((eq) => `${eq.id}:${eq.tombamento}`).join('|');
  useEffect(() => {
    setItensAjuste((s.itensGerados ?? []).map((eq) => ({ equipamentoId: eq.id, tombamento: eq.tombamento })));
  }, [chaveItensGerados]);

  const ehGP = usuario?.perfil === 'GESTOR_PATRIMONIO';
  // Confirmação de recebimento de Ampliação/Substituição, saída e retorno de
  // Empréstimo/Cessão são só da Unidade de origem — nem o Gestor de
  // Patrimônio pode fazer isso por ela (feedback 18/08)
  const souUnidadeOrigem = usuario?.perfil === 'UNIDADE' && usuario.unidadeId === s.unidadeOrigem.id;

  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      onAtualizado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setOcupado(false);
    }
  }

  // Aprovar só pede dados extras na Ampliação/Substituição (prioridade) e na
  // Recolha (etapa); nos demais tipos o clique já aprova, sem segunda confirmação.
  const aprovacaoPedeDados = TIPOS_COM_ATA.includes(s.tipo) || s.tipo === 'RECOLHA';

  function aprovarDireto() {
    return executar(() => api.post(`/solicitacoes/${s.id}/aprovar`, {}));
  }

  function abrirAcao(acao: 'aprovar' | 'negar') {
    setAcaoExibida(acao);
    setAcaoPendente(acao);
  }

  useEffect(() => {
    if (ajustandoTombamento) document.getElementById('ajuste-tombamento-0')?.focus({ preventScroll: true });
  }, [ajustandoTombamento]);

  // Leva o foco ao primeiro campo da ação aberta
  useEffect(() => {
    if (!acaoPendente) return;
    const alvo = acaoPendente === 'negar' ? 'solicitacao-motivo' : 'solicitacao-prioridade';
    document.getElementById(alvo)?.focus({ preventScroll: true });
  }, [acaoPendente]);

  const pendente = s.status === 'PENDENTE_APROVACAO';
  const aguardandoDisponibilidade = s.status === 'AGUARDANDO_DISPONIBILIDADE';

  const statusAtual = statusExibido(s);
  const tipoTexto = ROTULO_TIPO_SOLICITACAO[s.tipo];

  return (
    <section className="gestao-page equipamento-pagina" aria-labelledby="solicitacao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div>
          <div className="equipamento-titulo-linha">
            <h2 id="solicitacao-titulo">{nomeItem(s)}</h2>
            <span className="req-numero req-numero--titulo" aria-label={`Número ${codigoSolicitacao(s.numero)}`}>{codigoSolicitacao(s.numero)}</span>
            <span className={`inventario-status inventario-status--tom-${corDoStatus(statusAtual.valor)}`}>
              <span aria-hidden />
              {statusAtual.texto}
            </span>
          </div>
        </div>
        <div className="inventario-lista-acoes">
          <Link className="btn btn-outline" to={caminhoConversa('solicitacao', s.id)}>
            Conversar
          </Link>
        </div>
      </div>


      <div className="solicitacao-layout">
          <section className="equipamento-secao solicitacao-informacoes">
            <h3>Informações da solicitação</h3>
            <dl className="equipamento-dados">
              <div>
                <dt>Tipo</dt>
                <dd>{tipoTexto}</dd>
              </div>
              {s.equipamento && (
                <div>
                  <dt>Tombamento</dt>
                  <dd>{s.equipamento.tombamento}</dd>
                </div>
              )}
              {s.prioridade && (
                <div>
                  <dt>Prioridade</dt>
                  <dd>{s.prioridade}</dd>
                </div>
              )}
              {s.quantidade && s.tipo !== 'CESSAO_USO' && (
                <div>
                  <dt>Quantidade</dt>
                  <dd>{s.quantidade}</dd>
                </div>
              )}
              {s.numerosPatrimonio && s.numerosPatrimonio.length > 0 && (
                <div>
                  <dt>{s.numerosPatrimonio.length > 1 ? 'Nºs de patrimônio' : 'Nº de patrimônio'}</dt>
                  <dd>{s.numerosPatrimonio.join(', ')}</dd>
                </div>
              )}
              <div>
                <dt>Solicitado em</dt>
                <dd>{formatarData(s.criadoEm)}</dd>
              </div>
              {s.criadoPor && (
                <div>
                  <dt>Solicitado por</dt>
                  <dd>{s.criadoPor.nome}</dd>
                </div>
              )}
              {s.dataRetornoPrevista && (
                <div>
                  <dt>Retorno previsto</dt>
                  <dd>{formatarData(s.dataRetornoPrevista)}</dd>
                </div>
              )}
              {s.ata && ehGP && (
                <div>
                  <dt>Ata vinculada</dt>
                  <dd>
                    {s.ata.numero} {s.valorVinculado && `(${formatarMoeda(s.valorVinculado)})`}
                  </dd>
                </div>
              )}
            </dl>
          </section>

        <aside className="solicitacao-resumo" aria-label="Resumo da solicitação">
          <section className="equipamento-secao">
            <h3>Localização</h3>
            <dl className="equipamento-dados equipamento-dados--lateral">
              <div>
                <dt>Unidade de origem</dt>
                <dd>{s.unidadeOrigem.nome}</dd>
              </div>
              {/* Recolha sempre vai pro galpão padrão — não é informação relevante
                  pra mostrar (feedback do cliente 27/08) */}
              {s.unidadeDestino && s.tipo !== 'RECOLHA' && (
                <div>
                  <dt>Unidade de destino</dt>
                  <dd>{s.unidadeDestino.nome}</dd>
                </div>
              )}
              {s.entidadeExternaNome && (
                <div>
                  <dt>Entidade externa</dt>
                  <dd>{s.entidadeExternaNome}</dd>
                </div>
              )}
            </dl>
          </section>
        </aside>

        <div className="solicitacao-textos">
          <section className="equipamento-secao solicitacao-secao-texto">
            <h3>Justificativa</h3>
            <p>{s.justificativa}</p>
          </section>

          <section className="equipamento-secao solicitacao-secao-texto">
            <h3>Anexo</h3>
            {s.anexoUrl ? (
              s.anexoUrl.endsWith('.pdf') ? (
                <LinkArquivoProtegido caminho={s.anexoUrl}>Ver anexo (PDF)</LinkArquivoProtegido>
              ) : (
                <ImagemProtegida caminho={s.anexoUrl} alt="Anexo da solicitação" className="solicitacao-anexo-imagem" />
              )
            ) : (
              <div className="equipamento-historico-vazio">Sem arquivos anexados</div>
            )}
          </section>

          {s.motivoNegacao && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Motivo da negação</h3>
              <p>{s.motivoNegacao}</p>
            </section>
          )}

          {s.recebimentoOk === false && s.observacaoRecebimento && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Divergência no recebimento</h3>
              <p>{s.observacaoRecebimento}</p>
            </section>
          )}

          <HistoricoRecolhivel id="historico">
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
                      <strong>{rotuloEvento(evento)}</strong>
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
      {/* GP: aprovar/negar — sem escolher ata aqui (o sistema decide sozinho
          se reserva do estoque ou fica aguardando disponibilidade) */}
      {ehGP && pendente && (
        <div className="actions-box actions-box--simples">
          {/* Os campos ficam montados e só expandem/recolhem (altura animada), e a
              linha de botões é sempre a mesma — evita o "pulo" ao abrir a ação. */}
          <div
            className={`actions-expand${acaoPendente ? ' aberto' : ''}`}
            {...(acaoPendente ? {} : ({ inert: '' } as object))}
          >
            <div>
              {acaoExibida === 'aprovar' && (
                <>
                  {TIPOS_COM_ATA.includes(s.tipo) && (
                    <div className="field">
                      <label htmlFor="solicitacao-prioridade">Prioridade *</label>
                      <select id="solicitacao-prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value)} required>
                        <option value="" disabled>
                          Selecione...
                        </option>
                        <option value="1">1 — Alta</option>
                        <option value="2">2 — Média</option>
                        <option value="3">3 — Baixa</option>
                      </select>
                    </div>
                  )}
                  {s.tipo === 'RECOLHA' && (
                    <fieldset className="opcoes-radio opcoes-radio--grupo">
                      <legend>Etapa da recolha</legend>
                      <label className="opcao-radio">
                        <input
                          type="radio"
                          name="etapa-recolha"
                          checked={etapaRecolha === 'PATRIMONIO'}
                          onChange={() => setEtapaRecolha('PATRIMONIO')}
                        />
                        Aguardando recolha pelo Patrimônio
                      </label>
                      <label className="opcao-radio">
                        <input
                          type="radio"
                          name="etapa-recolha"
                          checked={etapaRecolha === 'BRANET'}
                          onChange={() => setEtapaRecolha('BRANET')}
                        />
                        Aguardando recolha pelo Branet
                      </label>
                    </fieldset>
                  )}
                </>
              )}

              {acaoExibida === 'negar' && (
                <div className="field">
                  <label htmlFor="solicitacao-motivo">Motivo da negação *</label>
                  <input id="solicitacao-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="actions-row">
            {acaoPendente === null ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => abrirAcao('negar')}>
                  Negar solicitação
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado}
                  onClick={() => (aprovacaoPedeDados ? abrirAcao('aprovar') : aprovarDireto())}
                >
                  Aprovar solicitação
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setAcaoPendente(null)}>
                  Cancelar
                </button>
                {acaoPendente === 'aprovar' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
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
                      )
                    }
                  >
                    Confirmar aprovação
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!motivo.trim()}
                    onClick={() =>
                      executar(
                        () => api.post(`/solicitacoes/${s.id}/negar`, { motivo }),
                      )
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

      {/* GP: aguardando disponibilidade — vincular ata (compra) ou tentar
          reservar do estoque de novo (ex: chegou estoque novo) */}
      {ehGP && aguardandoDisponibilidade && (
        <div className="actions-box actions-box--simples">
          <div className="actions-row">
            <button
              className="btn btn-primary"
              disabled={!s.disponivelParaReserva}
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/tentar-reservar-estoque`),
                )
              }
            >
              Reservar do estoque
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
            <label htmlFor="branet-pedido">Número do pedido *</label>
            <input id="branet-pedido" value={numeroPedidoBranet} onChange={(e) => setNumeroPedidoBranet(e.target.value)} />
          </div>
          {s.tipo !== 'CESSAO_USO' && (
            <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) minmax(0,1.4fr)' } as React.CSSProperties}>
              <div className="itens-cabecalho" aria-hidden>
                <span>Tombamento</span>
                <span>Descrição</span>
              </div>
              {itensBranet.map((item, i) => (
                <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                  <div className="itens-celula" data-rotulo="Tombamento">
                    <input
                      aria-label={`Tombamento do item ${i + 1}`}
                      value={item.tombamento}
                      onChange={(e) => {
                        const novos = [...itensBranet];
                        novos[i] = { ...item, tombamento: e.target.value };
                        setItensBranet(novos);
                      }}
                    />
                  </div>
                  <div className="itens-celula" data-rotulo="Descrição">
                    <input
                      aria-label={`Descrição do item ${i + 1}`}
                      value={item.descricao}
                      onChange={(e) => {
                        const novos = [...itensBranet];
                        novos[i] = { ...item, descricao: e.target.value };
                        setItensBranet(novos);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="actions-row">
            <button
              className="btn btn-primary"
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
                )
              }
            >
              Lançar no Branet
            </button>
          </div>
        </div>
      )}

      {/* GP: validação final, depois que a unidade já confirmou o recebimento */}
      {ehGP && s.status === 'AGUARDANDO_VALIDACAO' && (
        <div className="actions-box actions-box--simples">
          {/* Mesmo padrão de aprovar/negar: campos sempre montados (só expandem) e
              linha de botões fixa, para não "piscar" ao abrir o ajuste. */}
          <div
            className={`actions-expand${ajustandoTombamento ? ' aberto' : ''}`}
            {...(ajustandoTombamento ? {} : ({ inert: '' } as object))}
          >
            <div>
              <div className="field">
                <span id="ajuste-tombamento-rotulo" className="rotulo-campo">
                  Tombamento *
                </span>
                <div className="campos-empilhados" role="group" aria-labelledby="ajuste-tombamento-rotulo">
                  {itensAjuste.map((item, i) => (
                    <input
                      key={item.equipamentoId}
                      id={`ajuste-tombamento-${i}`}
                      aria-label={`Tombamento do item ${i + 1}`}
                      value={item.tombamento}
                      onChange={(e) => {
                        const novos = [...itensAjuste];
                        novos[i] = { ...item, tombamento: e.target.value };
                        setItensAjuste(novos);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="actions-row">
            {!ajustandoTombamento ? (
              <>
                {(s.itensGerados?.length ?? 0) > 0 && (
                  <button className="btn btn-outline" onClick={() => setAjustandoTombamento(true)}>
                    Ajustar tombamento
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    executar(() => api.post(`/solicitacoes/${s.id}/concluir`))
                  }
                >
                  Concluir solicitação
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-outline" onClick={() => setAjustandoTombamento(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    executar(async () => {
                      await api.patch(`/solicitacoes/${s.id}/ajustar-tombamento`, { itens: itensAjuste });
                      setAjustandoTombamento(false);
                    })
                  }
                >
                  Salvar ajuste
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Empréstimo: origem confirma a saída física do equipamento, que
          passa a "emprestado" (aguardando retorno). */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_SAIDA' && souUnidadeOrigem && (
        <div className="actions-box actions-box--simples">
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-saida`),
                )
              }
            >
              Confirmar saída
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
          <fieldset className="opcoes-radio">
            <legend className="gestao-sr-only">Situação do recebimento</legend>

            <div>
              <label className="opcao-radio">
                <input
                  type="radio"
                  name="recebimento"
                  checked={recebimentoOk === true}
                  onChange={() => setRecebimentoOk(true)}
                />
                Recebido corretamente
              </label>
              {recebimentoOk === true && (s.itensGerados ?? []).length > 0 && (
                <div className="opcao-radio-detalhe">
                  <span id="recebimento-patrimonio" className="rotulo-campo">
                    Confirme o nº de patrimônio *
                  </span>
                  <div className="campos-empilhados" role="group" aria-labelledby="recebimento-patrimonio">
                    {(s.itensGerados ?? []).map((eq, i) => (
                      <input
                        key={eq.id}
                        aria-label={`Nº de patrimônio do item ${i + 1}`}
                        value={tombamentosConfirmados[eq.id] ?? ''}
                        onChange={(e) =>
                          setTombamentosConfirmados({ ...tombamentosConfirmados, [eq.id]: e.target.value })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="opcao-radio">
                <input
                  type="radio"
                  name="recebimento"
                  checked={recebimentoOk === false}
                  onChange={() => setRecebimentoOk(false)}
                />
                Com divergência
              </label>
              {recebimentoOk === false && (
                <div className="opcao-radio-detalhe">
                  <div className="field">
                    <label htmlFor="recebimento-observacao">Qual a divergência? *</label>
                    <input
                      id="recebimento-observacao"
                      value={observacaoRecebimento}
                      onChange={(e) => setObservacaoRecebimento(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </fieldset>
          <div className="actions-row">
            <button
              className="btn btn-primary"
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
                )
              }
            >
              Confirmar recebimento
            </button>
          </div>
        </div>
      )}

      {/* Empréstimo: origem confirma retorno */}
      {s.tipo === 'EMPRESTIMO' && s.status === 'AGUARDANDO_RETORNO' && souUnidadeOrigem && (
        <div className="actions-box actions-box--simples">
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-retorno`),
                )
              }
            >
              Confirmar retorno do item
            </button>
          </div>
        </div>
      )}

      {/* Unidade de origem: confirma que o equipamento realmente saiu — não é
          mais o galpão quem confirma (feedback 26/08). A etapa (Patrimônio/
          Branet) é escolhida uma vez, na aprovação, e não é pré-requisito
          pra confirmar (feedback 27/08). */}
      {s.tipo === 'RECOLHA' && s.status === 'AGUARDANDO_ENTREGA' && souUnidadeOrigem && (
        <div className="actions-box actions-box--simples">
          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={() =>
                executar(
                  () => api.post(`/solicitacoes/${s.id}/confirmar-recolha`),
                )
              }
            >
              Confirmar recolha
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
