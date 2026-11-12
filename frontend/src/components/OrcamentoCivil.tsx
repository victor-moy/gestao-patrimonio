import { useState } from 'react';
import { api } from '../api/client';
import type { Manutencao } from '../types';
import { formatarMoeda } from '../utils/format';
import { LinkArquivoProtegido } from './ArquivoProtegido';
import { CampoAnexos } from './CampoAnexos';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

const MAX_ARQUIVOS = 5;

// Orçamento prévio do chamado civil: o que orçar (avaliação técnica), os PDFs do prestador e a decisão do fiscal, que informa o
// valor aprovado ao aprovar ou rejeita com motivo (o que reabre o envio). A publicação no Diário Oficial acontece fora do sistema.
export function OrcamentoCivil({
  m,
  ehTerceirizada,
  podeFiscalizar,
  executar,
  ocupado,
}: {
  m: Manutencao;
  ehTerceirizada: boolean;
  podeFiscalizar: boolean;
  executar: Executar;
  ocupado: boolean;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [valor, setValor] = useState('');
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const entregas = m.cotacoes ?? [];
  const rodada = m.rodadaOrcamento ?? 0;
  const dispensado = Boolean(m.dispensaOrcamentoMotivo);
  if (m.tipo !== 'CIVIL' || (rodada === 0 && !dispensado)) return null;

  const daRodada = entregas.filter((c) => c.rodada === rodada);
  const anteriores = entregas.filter((c) => c.rodada < rodada);
  const aguardando = m.status === 'AGUARDANDO_ORCAMENTO';
  const decidindo = m.status === 'ORCAMENTO_REGISTRADO';
  const aprovado = Boolean(m.cotacaoAprovadaId);

  async function enviar() {
    const dados = new FormData();
    arquivos.forEach((a) => dados.append('arquivos', a));
    await executar(() => api.post(`/manutencoes/${m.id}/cotacoes`, dados));
    setArquivos([]);
  }

  const links = (lista: typeof entregas) =>
    lista.map((c, i) => (
      <span key={c.id} className="orcamento-arquivo">
        <LinkArquivoProtegido caminho={c.arquivo}>{`Orçamento ${i + 1} (PDF)`}</LinkArquivoProtegido>
      </span>
    ));

  return (
    <section className="equipamento-secao" aria-labelledby="orcamento-titulo">
      <h3 id="orcamento-titulo">Orçamento prévio</h3>

      {dispensado ? (
        <dl className="equipamento-dados equipamento-dados--lateral">
          <div>
            <dt>Orçamento dispensado por risco à vida</dt>
            <dd className="avaliacao-texto">{m.dispensaOrcamentoMotivo}</dd>
          </div>
        </dl>
      ) : (
        <>
          <dl className="equipamento-dados equipamento-dados--lateral">
            {m.instrucoesOrcamento && (
              <div>
                <dt>O que orçar</dt>
                <dd className="avaliacao-texto">{m.instrucoesOrcamento}</dd>
              </div>
            )}
            {rodada > 1 && m.motivoRejeicaoOrcamento && aguardando && (
              <div role="alert">
                <dt>Orçamento rejeitado (envio {rodada - 1})</dt>
                <dd className="avaliacao-texto">{m.motivoRejeicaoOrcamento}</dd>
              </div>
            )}
            {daRodada.length > 0 && (
              <div>
                <dt>Orçamento enviado</dt>
                <dd className="orcamento-arquivos">{links(daRodada)}</dd>
              </div>
            )}
            {aprovado && m.orcamentoValor && (
              <div>
                <dt>Valor aprovado</dt>
                <dd>{formatarMoeda(m.orcamentoValor)}</dd>
              </div>
            )}
            {anteriores.length > 0 && (
              <div>
                <dt>Envios anteriores</dt>
                <dd className="orcamento-arquivos">{links(anteriores)}</dd>
              </div>
            )}
          </dl>

          {aguardando && ehTerceirizada && (
            <div className="solicitacao-acoes orcamento-acao">
              <div className="actions-box actions-box--simples">
                <CampoAnexos id="orcamento-arquivos" rotulo="Orçamento (PDF) *" arquivos={arquivos} onArquivos={setArquivos} max={MAX_ARQUIVOS} />
                <div className="actions-row">
                  <button type="button" className="btn btn-primary" disabled={ocupado || arquivos.length === 0} onClick={() => void enviar()}>
                    Enviar orçamento
                  </button>
                </div>
              </div>
            </div>
          )}

          {decidindo && podeFiscalizar && (
            <div className="solicitacao-acoes orcamento-acao">
              <div className="actions-box actions-box--simples">
                {rejeitando ? (
                  <div className="field">
                    <label htmlFor="orcamento-motivo">Motivo da rejeição *</label>
                    <input id="orcamento-motivo" autoFocus maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="orcamento-valor">Valor aprovado (R$) *</label>
                    <input id="orcamento-valor" type="number" step="0.01" min="0" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                  </div>
                )}
                <div className="actions-row">
                  {rejeitando ? (
                    <>
                      <button type="button" className="btn btn-outline" onClick={() => setRejeitando(false)}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado || motivo.trim().length < 3}
                        onClick={() => executar(() => api.post(`/manutencoes/${m.id}/rejeitar-cotacoes`, { motivo: motivo.trim() }))}
                      >
                        Rejeitar orçamento
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => setRejeitando(true)}>
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado || !(Number(valor) > 0)}
                        onClick={() => executar(() => api.post(`/manutencoes/${m.id}/aprovar-cotacao`, { valor: Number(valor) }))}
                      >
                        Aprovar orçamento
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {decidindo && !podeFiscalizar && <p className="itens-aviso">O orçamento foi enviado e aguarda a decisão do fiscal.</p>}
        </>
      )}
    </section>
  );
}
