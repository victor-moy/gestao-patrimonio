import { pode } from '../utils/permissoes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { LinkArquivoProtegido } from '../components/ArquivoProtegido';
import { ProblemasCivil } from '../components/ProblemasCivil';
import { OrdemServicoCivil, PaineisOS, STATUS_COM_DOCUMENTOS } from '../components/OrdemServicoCivil';
import { imprimirOs } from '../components/OsImpressao';
import { OrcamentoCivil } from '../components/OrcamentoCivil';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/StatusPill';
import { CampoAnexo } from '../components/CampoAnexo';
import { caminhoConversa } from '../utils/conversas';
import { HistoricoRecolhivel } from '../components/HistoricoRecolhivel';
import type { Contrato, EventoManutencao, Manutencao, StatusManutencao } from '../types';
import {
  formatarDataHora,
  formatarMoeda,
  ROTULO_ESTADO,
  statusManutencaoExibido,
  codigoManutencao,
} from '../utils/format';
import { nomeEquipamento, rotuloEventoManutencao, tituloManutencao } from '../utils/manutencao';
import './Solicitacoes.css';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { EsqueletoDetalhe } from '../components/Esqueletos';
import { AvaliacaoTecnica, LinhasEditaveis, ResumoAvaliacaoTecnica } from '../components/AvaliacaoTecnica';
import { useEdicaoAvaliacao } from '../hooks/useEdicaoAvaliacao';
import { AcoesCivil, RelatorioCivil } from '../components/ManutencaoCivil';
import { type ItemAcao, MenuAcoes } from '../components/MenuAcoes';
import { AcoesReencaminhamento, MotivoReencaminhamento, situacaoReencaminhamento, TrajetoriaCaso } from '../components/Reencaminhamento';

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

// Painel de ação aberto pelo menu "Ações" (cada um pede os dados da ação)
// Status em que a triagem pode bloquear o chamado (igual ao backend)
const STATUS_BLOQUEAVEIS: StatusManutencao[] = ['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'AGUARDANDO_EXECUCAO'];

type Acao = 'aprovar' | 'negar' | 'rejeitar' | 'orcamento' | 'finalizar' | 'retorno' | 'contestar' | 'ajustes' | 'reencaminhar' | 'decidir' | 'bloquear' | 'vistoria' | 'gerar-os' | 'executado' | 'recusar-os';

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
  const [motivo, setMotivo] = useState('');
  const [laudo, setLaudo] = useState<File | null>(null);
  const [orcamento, setOrcamento] = useState('');
  const [custoFinal, setCustoFinal] = useState('');
  const [estadoPos, setEstadoPos] = useState('BOM');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoItemId, setContratoItemId] = useState('');

  // Cada decisão do Operador depende da sua permissão (o backend confere de novo)
  const podeTriar = pode(usuario, 'MANUTENCAO_TRIAR');
  const podeAvaliar = pode(usuario, 'MANUTENCAO_AVALIAR');
  // Na avaliação técnica, os dados do chamado exibidos abaixo viram campos editáveis
  const editando = podeAvaliar && m.status === 'AGUARDANDO_AVALIACAO_TECNICA';
  const edicao = useEdicaoAvaliacao(m, editando);
  const podeFiscalizar = pode(usuario, 'MANUTENCAO_FISCALIZAR');
  const podeVistoriar = pode(usuario, 'MANUTENCAO_VISTORIAR', 'MANUTENCAO_AVALIAR');
  const ehTerceirizada = usuario?.perfil === 'TERCEIRIZADA';
  // Itens elegíveis: contrato vigente. O saldo não bloqueia a triagem (é conferido no orçamento ou na finalização)
  const contratosComItens = contratos.filter((c) => c.status !== 'EXPIRADO' && c.itens.length > 0);
  const ehUnidadeDona = usuario?.perfil === 'UNIDADE' && usuario.unidadeId === m.unidade.id;
  const titulo = tituloManutencao(m);
  // Só mostra a confirmação enquanto o lado de quem está vendo ainda não confirmou
  const podeConfirmarRetorno = (podeFiscalizar && !m.confirmadoGestor) || (ehUnidadeDona && !m.confirmadoUnidade);

  useEffect(() => {
    if (podeTriar) {
      api
        .get<Contrato[]>('/contratos')
        .then(setContratos)
        .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os contratos.'));
    }
  }, [podeTriar, setErro]);

  // A página fica aberta entre uma ação e outra: ao mudar o status, os formulários
  // de ação voltam ao estado inicial.
  useEffect(() => {
    setAcao(null);
    setMotivo('');
    setLaudo(null);
    setOrcamento('');
    setCustoFinal('');
    setContratoItemId('');
  }, [m.status]);

  useEffect(() => {
    if (!acao) return;
    if (acao === 'aprovar') document.getElementById('man-contrato-item')?.focus({ preventScroll: true });
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

  const abrir = (proxima: Acao) => setAcao(proxima);
  const fechar = () => setAcao(null);

  const aprovar = () =>
    executar(
      () => api.post(`/manutencoes/${m.id}/aprovar`, { contratoItemId }),
    );

  const enviarLaudo = async (caminho: string, extra?: Record<string, string>) => {
    const dados = new FormData();
    Object.entries(extra ?? {}).forEach(([chave, valor]) => dados.append(chave, valor));
    if (laudo) dados.append('laudo', laudo);
    await api.post(`/manutencoes/${m.id}/${caminho}`, dados);
  };

  const campoItemContrato = (
    <div className="field">
      <label htmlFor="man-contrato-item">Item do contrato</label>
      <select
        id="man-contrato-item"
        value={contratoItemId}
        onChange={(e) => setContratoItemId(e.target.value)}
        required
      >
        <option value="">Selecione…</option>
        {contratosComItens.map((c) => (
          <optgroup key={c.id} label={`${c.numero} · ${c.prestador.nome}`}>
            {c.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.servico.nome}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {contratosComItens.length === 0 && (
        <p className="itens-aviso itens-aviso--acao" role="status">
          Nenhum item de contrato disponível.
        </p>
      )}
    </div>
  );

  // Rejeitar o orçamento exige o laudo; vira um cartão próprio, no padrão dos demais blocos de ação
  const campoLaudo = (
    <div className="laudo-baixa" role="group" aria-labelledby="man-laudo-rotulo">
      <div id="man-laudo-rotulo" className="laudo-baixa-titulo">
        Laudo de baixa (PDF) *
      </div>
      <p className="laudo-baixa-ajuda">
        Obrigatório para rejeitar o orçamento. O equipamento será baixado e uma solicitação de substituição será aberta
        automaticamente.
      </p>
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

  // Orçamento a partir de 50% do preço de referência do tipo de item: o reparo não é sugerido
  const precoReferencia = Number(m.equipamento?.tipoEquipamento?.preco ?? 0);
  const valorOrcamento = Number(m.orcamentoValor ?? 0);
  const orcamentoAltoDemais = precoReferencia > 0 && valorOrcamento > 0 && valorOrcamento >= precoReferencia * 0.5;
  const percentualDoPreco = precoReferencia > 0 ? Math.round((valorOrcamento / precoReferencia) * 100) : 0;

  const rotuloSimNao = (confirmado: boolean) => (confirmado ? 'Confirmado' : 'Pendente');

  // O que o usuário pode fazer neste chamado agora (menu "Ações"): ações diretas executam na hora; as que pedem dados abrem um painel
  const civil = m.tipo === 'CIVIL';
  // OS assinada em vigor (a que o fiscal pode recusar): o último documento desse tipo que não foi recusado
  const osAssinada = (m.ordemServico?.documentos ?? []).filter((d) => d.tipo === 'OS_ASSINADA' && !d.recusadoEm).at(-1);
  const reenc = situacaoReencaminhamento(m, podeTriar, ehTerceirizada);
  const itensMenu: ItemAcao[] = [];
  const item = (id: string, rotulo: string, aoEscolher: () => void, extra: Partial<ItemAcao> = {}) =>
    itensMenu.push({ id, rotulo, aoEscolher, ...extra });
  const direta = (operacao: () => Promise<unknown>) => () => void executar(operacao);

  if (podeTriar && m.status === 'PENDENTE_APROVACAO') {
    item('aprovar', 'Aprovar chamado', () => abrir('aprovar'));
    item('negar', 'Negar chamado', () => abrir('negar'));
  }
  if (podeTriar && m.status === 'AVALIADO') {
    item('encaminhar-avaliado', 'Encaminhar ao prestador', direta(() => api.post(`/manutencoes/${m.id}/encaminhar-avaliado`, {})));
  }
  if (podeVistoriar && m.status === 'AGUARDANDO_VISTORIA') item('vistoria', 'Registrar vistoria', () => abrir('vistoria'));
  if (podeTriar && STATUS_BLOQUEAVEIS.includes(m.status)) item('bloquear', 'Bloquear chamado', () => abrir('bloquear'));
  if (podeTriar && m.status === 'BLOQUEADO') {
    item('desbloquear', 'Desbloquear chamado', direta(() => api.post(`/manutencoes/${m.id}/desbloquear`, {})));
  }
  if (ehTerceirizada && m.status === 'AGUARDANDO_EXECUCAO' && civil) item('gerar-os', 'Gerar OS', () => abrir('gerar-os'));
  // Chamado civil: as cotações são enviadas e decididas no bloco “Orçamento prévio”, não por este menu
  if (ehTerceirizada && m.status === 'AGUARDANDO_ORCAMENTO' && !civil) item('orcamento', 'Registrar orçamento', () => abrir('orcamento'));
  if (podeAvaliar && m.status === 'ORCAMENTO_REGISTRADO' && !civil) {
    item('aprovar-orcamento', 'Aprovar orçamento', direta(() => enviarLaudo('validar-orcamento', { aprovado: 'true' })));
    item('rejeitar', 'Rejeitar orçamento', () => abrir('rejeitar'));
  }
  if (ehTerceirizada && m.status === 'EM_EXECUCAO') {
    if (civil) {
      const semItens = (m.linhasRelatorio ?? []).length === 0;
      if (!m.ordemServico) {
        // Chamado que já estava em execução antes da OS existir
        item('gerar-os', 'Gerar OS', () => abrir('gerar-os'));
      } else {
        // Depois de ajustes do fiscal os dados da execução já estão na OS: reenvia direto
        const aoMarcar = m.motivoAjuste ? direta(() => api.post(`/manutencoes/${m.id}/registrar-retorno`, {})) : () => abrir('executado');
        item('executado', 'Marcar como executado', aoMarcar, {
          desabilitada: semItens,
          dica: semItens ? 'Lance ao menos um item executado' : undefined,
        });
      }
    } else {
      item('finalizar', 'Finalizar', () => abrir('finalizar'));
    }
  }
  if (m.status === 'AGUARDANDO_RETORNO' && podeConfirmarRetorno) {
    if (civil && ehUnidadeDona) {
      item('resolvido', 'Problema resolvido', direta(() => api.post(`/manutencoes/${m.id}/confirmar-retorno`, {})));
      item('contestar', 'Contestar', () => abrir('contestar'));
    } else if (!civil) {
      item('retorno', 'Confirmar retorno', () => abrir('retorno'));
    }
  }
  if (civil && podeFiscalizar && m.status === 'AGUARDANDO_MEDICAO') {
    item('aprovar-medicao', 'Aprovar', direta(() => api.post(`/manutencoes/${m.id}/autorizar-medicao`, {})));
    item('ajustes', 'Solicitar ajustes', () => abrir('ajustes'));
  }
  // A OS só existe no chamado civil depois de gerada; a versão de papel está no próprio detalhe (aparece só ao imprimir)
  if (civil && m.ordemServico) item('imprimir-os', 'Imprimir OS', imprimirOs);
  if (civil && podeFiscalizar && osAssinada && STATUS_COM_DOCUMENTOS.includes(m.status)) item('recusar-os', 'Recusar OS assinada', () => abrir('recusar-os'));
  if (reenc.podePedir) item('reencaminhar', 'Reencaminhar', () => abrir('reencaminhar'));
  if (reenc.confirmando) {
    item('confirmar-reenc', 'Confirmar reencaminhamento', direta(() => api.post(`/manutencoes/${m.id}/confirmar-reencaminhamento`)));
  }
  if (reenc.decidindo) item('decidir', 'Decidir destino do chamado', () => abrir('decidir'));

  return (
    <section className="gestao-page equipamento-pagina" aria-labelledby="manutencao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div>
          <div className="equipamento-titulo-linha">
            <h2 id="manutencao-titulo">{titulo}</h2>
            <span className="req-numero req-numero--titulo" aria-label={`Número ${codigoManutencao(m.numero)}`}>{codigoManutencao(m.numero)}</span>
            <StatusPill valor={statusManutencaoExibido(m).valor}>{statusManutencaoExibido(m).texto}</StatusPill>
          </div>
        </div>
        <div className="inventario-lista-acoes">
          <Link className="btn btn-outline" to={caminhoConversa('manutencao', m.id)}>
            Conversar
          </Link>
          <MenuAcoes itens={itensMenu} ocupado={ocupado} />
        </div>
      </div>


      <div className="solicitacao-lateral">
          <div className="solicitacao-acoes">
            {podeTriar && STATUS_BLOQUEAVEIS.includes(m.status) && acao === 'bloquear' && (
              <div className="actions-box">
                <div className="actions-title">Bloquear chamado</div>
                <div className="field">
                  <label htmlFor="man-motivo-bloqueio">Motivo do bloqueio *</label>
                  <input id="man-motivo-bloqueio" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <div className="actions-row">
                  <button type="button" className="btn btn-outline" onClick={fechar}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado || motivo.trim().length < 3}
                    onClick={() => executar(() => api.post(`/manutencoes/${m.id}/bloquear`, { motivo }))}
                  >
                    Confirmar bloqueio
                  </button>
                </div>
              </div>
            )}
            {civil && podeFiscalizar && osAssinada && acao === 'recusar-os' && (
              <div className="actions-box">
                <div className="actions-title">Recusar OS assinada</div>
                <div className="field">
                  <label htmlFor="man-recusa-os">Motivo da recusa *</label>
                  <input id="man-recusa-os" autoFocus maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <div className="actions-row">
                  <button type="button" className="btn btn-outline" onClick={fechar}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado || motivo.trim().length < 3}
                    onClick={() => executar(() => api.post(`/manutencoes/${m.id}/documentos/${osAssinada.id}/recusar`, { motivo: motivo.trim() }))}
                  >
                    Confirmar recusa
                  </button>
                </div>
              </div>
            )}
            {ehTerceirizada && civil && <PaineisOS m={m} painel={acao} fechar={fechar} executar={executar} ocupado={ocupado} />}

            {podeVistoriar && m.status === 'AGUARDANDO_VISTORIA' && acao === 'vistoria' && (
              <div className="actions-box">
                <div className="actions-title">Registrar vistoria</div>
                <div className="field">
                  <label htmlFor="man-parecer-vistoria">Parecer da vistoria *</label>
                  <textarea id="man-parecer-vistoria" rows={3} maxLength={1000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
                <div className="actions-row">
                  <button type="button" className="btn btn-outline" onClick={fechar}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado || motivo.trim().length < 3}
                    onClick={() => executar(() => api.post(`/manutencoes/${m.id}/registrar-vistoria`, { parecer: motivo.trim() }))}
                  >
                    Registrar e voltar à avaliação
                  </button>
                </div>
              </div>
            )}

            {m.tipo === 'CIVIL' ? (
              <AcoesCivil
                m={m}
                executar={executar}
                ocupado={ocupado}
                podeTriar={podeTriar}
                podeFiscalizar={podeFiscalizar}
                ehUnidadeDona={ehUnidadeDona}
                painel={acao}
                fechar={fechar}
              />
            ) : (
              <>
                {/* Triagem: aprovar (item de contrato obrigatório) ou negar (motivo obrigatório) */}
                {podeTriar && m.status === 'PENDENTE_APROVACAO' && (acao === 'aprovar' || acao === 'negar') && (
                  <div className="actions-box">
                    <div className="actions-title">{acao === 'aprovar' ? 'Aprovar chamado' : 'Negar chamado'}</div>
                    {acao === 'aprovar' ? (
                      campoItemContrato
                    ) : (
                      <div className="field">
                        <label htmlFor="man-motivo">Motivo da negação *</label>
                        <input id="man-motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                      </div>
                    )}
                    <div className="actions-row">
                      <button type="button" className="btn btn-outline" onClick={fechar}>
                        Cancelar
                      </button>
                      {acao === 'aprovar' ? (
                        <button type="button" className="btn btn-primary" disabled={ocupado || !contratoItemId} onClick={aprovar}>
                          Confirmar aprovação
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={ocupado || !motivo.trim()}
                          onClick={() => executar(() => api.post(`/manutencoes/${m.id}/negar`, { motivo }))}
                        >
                          Confirmar negação
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {ehTerceirizada && m.status === 'AGUARDANDO_ORCAMENTO' && acao === 'orcamento' && (
                  <div className="actions-box">
                    <div className="actions-title">Registrar orçamento</div>
                    <div className="field">
                      <label htmlFor="man-orcamento">Valor do orçamento (R$) *</label>
                      <input
                        id="man-orcamento"
                        type="number"
                        step="0.01"
                        min="0"
                        autoFocus
                        value={orcamento}
                        onChange={(e) => setOrcamento(e.target.value)}
                      />
                    </div>
                    <div className="actions-row">
                      <button type="button" className="btn btn-outline" onClick={fechar}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado || orcamento === ''}
                        onClick={() => executar(() => api.post(`/manutencoes/${m.id}/orcamento`, { valor: Number(orcamento) }))}
                      >
                        Registrar orçamento
                      </button>
                    </div>
                  </div>
                )}

                {/* Alerta de custo: orçamento a partir de 50% do preço de referência do item — manutenção não sugerida */}
                {podeAvaliar && m.status === 'ORCAMENTO_REGISTRADO' && orcamentoAltoDemais && (
                  <div className="aviso-manutencao" role="alert">
                    <strong>Manutenção não sugerida</strong>
                    <p>
                      O orçamento de {formatarMoeda(m.orcamentoValor)} corresponde a {percentualDoPreco}% do preço de
                      referência do item ({formatarMoeda(precoReferencia)}). Com orçamento igual ou superior a 50% do
                      preço de referência, o reparo não é sugerido: avalie rejeitar o orçamento e baixar o equipamento.
                    </p>
                  </div>
                )}

                {/* Validação do orçamento: aprovar direto (menu) ou rejeitar anexando o laudo de baixa */}
                {podeAvaliar && m.status === 'ORCAMENTO_REGISTRADO' && acao === 'rejeitar' && (
                  <div className="actions-box">
                    <div className="actions-title">Rejeitar orçamento</div>
                    {campoLaudo}
                    <div className="actions-row">
                      <button type="button" className="btn btn-outline" onClick={fechar}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado || !laudo}
                        onClick={() => executar(() => enviarLaudo('validar-orcamento', { aprovado: 'false' }))}
                      >
                        Confirmar rejeição
                      </button>
                    </div>
                  </div>
                )}

                {/* Terceirizada: confirma que o reparo terminou (depois, Unidade e Administrador confirmam o retorno) */}
                {ehTerceirizada && m.status === 'EM_EXECUCAO' && acao === 'finalizar' && (
                  <div className="actions-box">
                    <div className="actions-title">Finalizar</div>
                    <div className="field">
                      <label htmlFor="man-custo">Custo final (R$)</label>
                      <input
                        id="man-custo"
                        type="number"
                        step="0.01"
                        min="0.01"
                        autoFocus
                        placeholder={m.orcamentoValor ?? ''}
                        value={custoFinal}
                        onChange={(e) => setCustoFinal(e.target.value)}
                      />
                    </div>
                    <div className="actions-row">
                      <button type="button" className="btn btn-outline" onClick={fechar}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado}
                        onClick={() =>
                          executar(() =>
                            api.post(`/manutencoes/${m.id}/registrar-retorno`, {
                              ...(Number(custoFinal) > 0 ? { custoFinal: Number(custoFinal) } : {}),
                            }),
                          )
                        }
                      >
                        Finalizar
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirmação dupla do retorno: Unidade e Administrador */}
                {m.status === 'AGUARDANDO_RETORNO' && podeConfirmarRetorno && acao === 'retorno' && (
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
                      <button type="button" className="btn btn-outline" onClick={fechar}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado}
                        onClick={() => executar(() => api.post(`/manutencoes/${m.id}/confirmar-retorno`, { estadoPosManutencao: estadoPos }))}
                      >
                        Confirmar retorno
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <AcoesReencaminhamento
              m={m}
              executar={executar}
              ocupado={ocupado}
              podeTriar={podeTriar}
              painel={acao}
              fechar={fechar}
            />
          </div>
        </div>

      <div className="solicitacao-layout">
        <section className="equipamento-secao solicitacao-informacoes">
          <h3>Informações da manutenção</h3>
          <dl className={`equipamento-dados${editando ? ' equipamento-dados--edicao' : ''}`}>
            {editando ? (
              <LinhasEditaveis m={m} edicao={edicao} />
            ) : (
              <>
                {/* Unidade, setor e solicitante sempre abrem a tabela */}
                <div>
                  <dt>Unidade</dt>
                  <dd>{m.unidade.nome}</dd>
                </div>
                {(m.tipo === 'CIVIL' ? m.localAfetado : (m.setores ?? []).length > 0) && (
                  <div>
                    <dt>Setor afetado</dt>
                    <dd>{m.tipo === 'CIVIL' ? m.localAfetado : (m.setores ?? []).map((x) => x.setor.nome).join(', ')}</dd>
                  </div>
                )}
                <div>
                  <dt>Solicitado por</dt>
                  <dd>{m.solicitante.nome}</dd>
                </div>
                {m.equipamento ? (
                  <div>
                    <dt>Item</dt>
                    <dd>
                      {nomeEquipamento(m)}
                      <span className="dado-apoio">{m.equipamento.tombamento}</span>
                    </dd>
                  </div>
                ) : (
                  <div>
                    <dt>Tipo de problema</dt>
                    <dd>{m.categoriaCivil?.nome ?? '—'}</dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt>Solicitado em</dt>
              <dd>{formatarDataHora(m.criadoEm)}</dd>
            </div>
            {m.contrato && (
              <div>
                <dt>Contrato</dt>
                <dd>
                  {m.contrato.numero} · {m.contrato.prestador.nome}
                </dd>
              </div>
            )}
            {!editando && m.contratoItem && (
              <div>
                <dt>Item do contrato</dt>
                <dd>{m.contratoItem.servico.nome}</dd>
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
            {m.tipo === 'CIVIL' && ['AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO', 'CONCLUIDA'].includes(m.status) && (
              <>
                <div>
                  <dt>Problema resolvido (unidade)</dt>
                  <dd>{rotuloSimNao(m.confirmadoUnidade)}</dd>
                </div>
                <div>
                  <dt>Medição autorizada</dt>
                  <dd>{m.conferidoMedicaoEm ? formatarDataHora(m.conferidoMedicaoEm) : 'Pendente'}</dd>
                </div>
              </>
            )}
            {m.tipo !== 'CIVIL' && m.status === 'AGUARDANDO_RETORNO' && (
              <>
                <div>
                  <dt>Confirmação da unidade</dt>
                  <dd>{rotuloSimNao(m.confirmadoUnidade)}</dd>
                </div>
                <div>
                  <dt>Confirmação do administrador</dt>
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

        <div className="solicitacao-textos">
          {!editando && m.tipo !== 'CIVIL' && (
            <section className="equipamento-secao">
              <h3>Sobre o problema</h3>
              <dl className="equipamento-dados equipamento-dados--lateral">
                <div>
                  <dt>Descrição</dt>
                  <dd className="avaliacao-texto">{m.descricaoProblema}</dd>
                </div>
              </dl>
            </section>
          )}

          {m.tipo === 'CIVIL' && (
            <ProblemasCivil
              m={m}
              descricao={editando ? undefined : m.descricaoProblema}
              podeAcrescentar={ehUnidadeDona || pode(usuario, 'MANUTENCAO_ESCREVER')}
              executar={executar}
              ocupado={ocupado}
            />
          )}

          <OrcamentoCivil m={m} ehTerceirizada={ehTerceirizada} podeFiscalizar={podeFiscalizar} executar={executar} ocupado={ocupado} />

          <OrdemServicoCivil m={m} ehTerceirizada={ehTerceirizada} executar={executar} ocupado={ocupado} />

          <AvaliacaoTecnica m={m} edicao={edicao} executar={executar} ocupado={ocupado} />

          {!editando && <ResumoAvaliacaoTecnica m={m} />}

          <MotivoReencaminhamento m={m} />

          {m.contestacaoUnidade && (m.status === 'EM_EXECUCAO' || m.status === 'CONCLUIDA') && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Contestação da unidade</h3>
              <p>{m.contestacaoUnidade}</p>
            </section>
          )}

          {m.motivoAjuste && m.status === 'EM_EXECUCAO' && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Ajustes solicitados</h3>
              <p>{m.motivoAjuste}</p>
            </section>
          )}

          {m.tipo === 'CIVIL' && (
            <RelatorioCivil m={m} executar={executar} ocupado={ocupado} ehTerceirizada={ehTerceirizada} />
          )}

          {m.justificativa && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Justificativa</h3>
              <p>{m.justificativa}</p>
            </section>
          )}

          {m.status === 'PENDENTE_APROVACAO' && m.informacoesSolicitadas && (
            <section className="equipamento-secao solicitacao-secao-texto" role="status">
              <h3>A avaliação técnica pediu informações</h3>
              <p>{m.informacoesSolicitadas}</p>
            </section>
          )}

          {m.status === 'BLOQUEADO' && m.motivoBloqueio && (
            <section className="equipamento-secao solicitacao-secao-texto">
              <h3>Motivo do bloqueio</h3>
              <p>{m.motivoBloqueio}</p>
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

          <TrajetoriaCaso manutencaoId={m.id} status={m.status} />
        </div>

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
                    <strong>{rotuloEventoManutencao(evento, m.tipo)}</strong>
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
    </section>
  );
}
