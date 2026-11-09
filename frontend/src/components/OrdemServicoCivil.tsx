import { useRef, useState } from 'react';
import { api } from '../api/client';
import type { DocumentoOS, Manutencao } from '../types';
import { OsImpressao } from './OsImpressao';
import { formatarData } from '../utils/format';
import { LinkArquivoProtegido } from './ArquivoProtegido';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

const ROTULO_DOC: Record<DocumentoOS['tipo'], string> = { OS_ASSINADA: 'OS assinada', RELATORIO: 'Relatório de execução' };
// O relatório de execução saiu da documentação (o que ele trazia está na própria OS); documentos antigos desse tipo só deixam de ser exigidos
const TIPOS: DocumentoOS['tipo'][] = ['OS_ASSINADA'];
// Enquanto o chamado não foi aprovado de vez, o fiscal pode recusar um documento
export const STATUS_COM_DOCUMENTOS = ['EXECUTADO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO'];

// "2026-11-05T09:30" (campo datetime-local, horário do navegador) para o instante em ISO
const paraIso = (local: string) => new Date(local).toISOString();

// Formulários abertos pelo menu "Ações" do prestador: gerar a OS e marcar o serviço como executado
export function PaineisOS({
  m,
  painel,
  fechar,
  executar,
  ocupado,
}: {
  m: Manutencao;
  painel: string | null;
  fechar: () => void;
  executar: Executar;
  ocupado: boolean;
}) {
  const [equipe, setEquipe] = useState('');
  const [dia, setDia] = useState('');
  const [escopo, setEscopo] = useState(m.orientacoesTerceirizada || m.descricaoProblema || '');
  const [entrada, setEntrada] = useState('');
  const [saida, setSaida] = useState('');
  const [resultado, setResultado] = useState('');
  const [observacao, setObservacao] = useState('');

  if (painel === 'gerar-os') {
    const valido = equipe.trim().length >= 2 && dia !== '' && escopo.trim().length >= 3;
    return (
      <div className="actions-box">
        <div className="actions-title">Gerar ordem de serviço</div>
        <p className="itens-aviso">Uma OS por chamado. Ao gerar, o chamado passa a “em rota” e a OS pode ser impressa para a assinatura da unidade.</p>
        <div className="field">
          <label htmlFor="os-equipe">Equipe *</label>
          <input id="os-equipe" autoFocus maxLength={200} placeholder="Ex.: João e Pedro" value={equipe} onChange={(e) => setEquipe(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-dia">Dia da visita *</label>
          <input id="os-dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-escopo">Escopo do serviço *</label>
          <textarea id="os-escopo" rows={3} maxLength={2000} value={escopo} onChange={(e) => setEscopo(e.target.value)} />
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn-outline" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado || !valido}
            onClick={() => executar(() => api.post(`/manutencoes/${m.id}/gerar-os`, { equipe: equipe.trim(), dataPrevista: dia, escopo: escopo.trim() }))}
          >
            Gerar OS
          </button>
        </div>
      </div>
    );
  }

  if (painel === 'executado') {
    const valido = entrada !== '' && saida !== '' && new Date(saida) > new Date(entrada) && resultado !== '';
    return (
      <div className="actions-box">
        <div className="actions-title">Marcar como executado</div>
        <div className="field">
          <label htmlFor="os-entrada">Entrada na unidade *</label>
          <input id="os-entrada" type="datetime-local" autoFocus value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-saida">Saída da unidade *</label>
          <input id="os-saida" type="datetime-local" value={saida} onChange={(e) => setSaida(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="os-resultado">Resultado *</label>
          <select id="os-resultado" value={resultado} onChange={(e) => setResultado(e.target.value)}>
            <option value="">Selecione...</option>
            <option value="TOTAL">Total: o problema foi resolvido</option>
            <option value="PARCIAL">Parcial: ficou pendência</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="os-observacao">Observação</label>
          <textarea id="os-observacao" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn-outline" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ocupado || !valido}
            onClick={() =>
              executar(() =>
                api.post(`/manutencoes/${m.id}/registrar-retorno`, {
                  entradaEm: paraIso(entrada),
                  saidaEm: paraIso(saida),
                  resultado,
                  ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
                }),
              )
            }
          >
            Marcar como executado
          </button>
        </div>
      </div>
    );
  }
  return null;
}

// Uma linha por tipo de documento: o válido (último não recusado), a pendência e o histórico de recusas
function LinhaDocumento({
  m,
  tipo,
  documentos,
  podeEnviar,
  executar,
  ocupado,
}: {
  m: Manutencao;
  tipo: DocumentoOS['tipo'];
  documentos: DocumentoOS[];
  podeEnviar: boolean;
  executar: Executar;
  ocupado: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const doTipo = documentos.filter((d) => d.tipo === tipo);
  const valido = doTipo.filter((d) => !d.recusadoEm).at(-1);
  const recusados = doTipo.filter((d) => d.recusadoEm);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const dados = new FormData();
    dados.append('tipo', tipo);
    dados.append('arquivo', arquivo);
    await executar(() => api.post(`/manutencoes/${m.id}/documentos`, dados));
    if (input.current) input.current.value = '';
  }

  const nome = ROTULO_DOC[tipo];
  return (
    <div className="os-documento" role="group" aria-label={nome}>
      <dt>{nome}</dt>
      <dd>
        {valido ? (
          <>
            Enviado em {formatarData(valido.enviadoEm)} · <LinkArquivoProtegido caminho={valido.arquivo}>Ver PDF</LinkArquivoProtegido>
          </>
        ) : (
          'Pendente'
        )}
        {recusados.map((d) => (
          <span key={d.id} className="dado-apoio" role="status">
            Recusado em {formatarData(d.recusadoEm as string)}: {d.motivoRecusa}
          </span>
        ))}
      </dd>
      {!valido && podeEnviar && (
        <dd className="os-documento-acoes">
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            tabIndex={-1}
            aria-label={`Arquivo da ${nome}`}
            onChange={(e) => void enviar(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn btn-outline"
            aria-label={`Enviar ${nome.toLowerCase()} (PDF)`}
            disabled={ocupado}
            onClick={() => input.current?.click()}
          >
            Enviar PDF
          </button>
        </dd>
      )}
    </div>
  );
}

// OS do chamado civil: o que foi planejado, o que aconteceu, a documentação e a versão para imprimir e assinar em papel
export function OrdemServicoCivil({
  m,
  ehTerceirizada,
  executar,
  ocupado,
}: {
  m: Manutencao;
  ehTerceirizada: boolean;
  executar: Executar;
  ocupado: boolean;
}) {
  const os = m.ordemServico;
  if (m.tipo !== 'CIVIL' || !os) return null;
  const codigo = `OS-${String(os.numero).padStart(4, '0')}`;
  const mostraDocumentos = STATUS_COM_DOCUMENTOS.includes(m.status) || m.status === 'CONCLUIDA';
  const pendentes = m.status === 'EXECUTADO';

  return (
    <>
      {mostraDocumentos && (
        <section className="equipamento-secao" aria-labelledby="os-documentos-titulo">
          <h3 id="os-documentos-titulo">Documentação</h3>
          <dl className="equipamento-dados equipamento-dados--lateral">
          {TIPOS.map((tipo) => (
            <LinhaDocumento
              key={tipo}
              m={m}
              tipo={tipo}
              documentos={os.documentos}
              podeEnviar={ehTerceirizada && pendentes}
              executar={executar}
              ocupado={ocupado}
            />
          ))}
          </dl>
        </section>
      )}

      {/* Versão de papel: só aparece ao imprimir; a assinatura é física */}
      <OsImpressao m={m} os={os} codigo={codigo} />
    </>
  );
}
