import { useState } from 'react';
import { api } from '../api/client';
import type { Manutencao } from '../types';
import { formatarData } from '../utils/format';
import { CampoFotos, DESCRICAO_CIVIL_MIN } from './CamposManutencaoCivil';
import { FotosCivil, GradeFotosCivil } from './ManutencaoCivil';

// Status em que ainda dá para acrescentar outro problema (antes de o chamado ir ao prestador; igual ao backend)
const STATUS_QUE_ACEITAM = ['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA'];

// Respostas às perguntas da categoria e os outros problemas acrescentados ao chamado civil
export function ProblemasCivil({
  m,
  descricao: descricaoChamado,
  podeAcrescentar,
  executar,
  ocupado,
}: {
  m: Manutencao;
  // Descrição do problema do chamado: aparece no mesmo box das respostas da abertura
  descricao?: string;
  podeAcrescentar: boolean;
  executar: (operacao: () => Promise<unknown>) => Promise<void>;
  ocupado: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [fotos, setFotos] = useState<File[]>([]);

  const respostas = m.respostas ?? [];
  const extras = m.problemasExtras ?? [];
  const aceita = podeAcrescentar && STATUS_QUE_ACEITAM.includes(m.status);
  if (!descricaoChamado && respostas.length === 0 && extras.length === 0 && !aceita) return null;

  async function enviar() {
    const dados = new FormData();
    dados.append('descricao', descricao.trim());
    fotos.forEach((f) => dados.append('fotos', f));
    await executar(() => api.post(`/manutencoes/${m.id}/problemas`, dados));
    setAberto(false);
    setDescricao('');
    setFotos([]);
  }

  return (
    <>
      {(descricaoChamado || respostas.length > 0) && (
        <section className="equipamento-secao">
          <h3>Sobre o problema</h3>
          <dl className="equipamento-dados equipamento-dados--lateral">
            {descricaoChamado && (
              <div>
                <dt>Descrição</dt>
                <dd className="avaliacao-texto">{descricaoChamado}</dd>
              </div>
            )}
            {respostas.map((r) => (
              <div key={r.id}>
                <dt>{r.perguntaTexto}</dt>
                <dd>{r.resposta}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <FotosCivil fotos={m.fotos ?? []} />
      {(extras.length > 0 || aceita) && (
        <section className="equipamento-secao">
          <h3>Problemas adicionais</h3>
          {extras.length > 0 && (
            <dl className="equipamento-dados equipamento-dados--lateral">
              {extras.map((p, i) => (
                <div key={p.id} role="group" aria-label={`Problema acrescentado ${i + 1}`}>
                  <dt>
                    Problema adicional {i + 1} · {p.criadoPor.nome} · {formatarData(p.criadoEm)}
                  </dt>
                  <dd className="avaliacao-texto">{p.descricao}</dd>
                  {p.fotos.length > 0 && (
                    <dd className="problema-adicional-fotos">
                      <GradeFotosCivil fotos={p.fotos} />
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}
          {aceita && !aberto && (
            <div className="civil-adicionar">
              <button type="button" className="btn btn-link" onClick={() => setAberto(true)}>
                <span>+ Acrescentar problema</span>
              </button>
            </div>
          )}
          {aceita && aberto && (
            <div className="solicitacao-acoes problema-adicional-form">
              <div className="actions-box actions-box--simples">
                <div className="field">
                  <label htmlFor="problema-descricao">Descrição do problema *</label>
                  <textarea id="problema-descricao" rows={3} autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                </div>
                <CampoFotos id="problema-fotos" fotos={fotos} onFotos={setFotos} />
                <div className="actions-row">
                  <button type="button" className="btn btn-outline" onClick={() => setAberto(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={ocupado || descricao.trim().length < DESCRICAO_CIVIL_MIN}
                    onClick={() => void enviar()}
                  >
                    Acrescentar
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
