import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { CategoriaCivil, ChamadoAberto, Setor } from '../types';
import { IconeFechar } from './icons';
import { MultiSelecao } from './MultiSelecao';
import { StatusPill } from './StatusPill';
import { codigoManutencao, statusManutencaoExibido } from '../utils/format';

export const MAX_FOTOS_CIVIL = 4;
export const DESCRICAO_CIVIL_MIN = 5;

// Outro problema da mesma categoria, com as próprias fotos
export interface ProblemaForm {
  descricao: string;
  fotos: File[];
}

export interface DadosCivil {
  // Setores da unidade afetados (um ou mais); o texto livre só vale se a unidade não tem setores cadastrados
  setorIds: string[];
  localAfetado: string;
  categoriaCivilId: string;
  descricaoProblema: string;
  // Respostas às perguntas da categoria: { perguntaId: resposta }
  respostas: Record<string, string>;
  // Outros problemas da mesma categoria, enviados junto com o chamado
  extras: ProblemaForm[];
}

interface Props {
  setores: Setor[];
  categorias: CategoriaCivil[];
  // Chamados em aberto da mesma categoria; o solicitante pode acrescentar o problema a um deles em vez de abrir outro
  abertos: ChamadoAberto[];
  acrescentarEm: ChamadoAberto | null;
  onAcrescentar: (chamado: ChamadoAberto | null) => void;
  valor: DadosCivil;
  onChange: (proximo: DadosCivil) => void;
  fotos: File[];
  onFotos: (fotos: File[]) => void;
}

export const categoriaDoChamado = (categorias: CategoriaCivil[], id: string) => categorias.find((c) => c.id === id);

export function civilIncompleto(v: DadosCivil, temSetores: boolean, categorias: CategoriaCivil[], acrescentando = false) {
  const curto = (t: string) => t.trim().length < DESCRICAO_CIVIL_MIN;
  if (curto(v.descricaoProblema) || v.extras.some((p) => curto(p.descricao))) return true;
  // Acrescentando a um chamado que já existe, local, categoria e perguntas são os dele
  if (acrescentando) return false;
  if (temSetores ? v.setorIds.length === 0 : v.localAfetado.trim().length < 2) return true;
  const categoria = categoriaDoChamado(categorias, v.categoriaCivilId);
  if (!categoria) return true;
  return categoria.perguntas.some((p) => p.obrigatoria && !(v.respostas[p.id] ?? '').trim());
}

// Escolha de fotos de um problema (JPG, PNG ou WebP, até 4)
export function CampoFotos({ id, fotos, onFotos, rotulo = 'Fotos' }: { id: string; fotos: File[]; onFotos: (f: File[]) => void; rotulo?: string }) {
  const input = useRef<HTMLInputElement>(null);

  function adicionar(escolhidas: FileList | null) {
    if (!escolhidas) return;
    onFotos([...fotos, ...Array.from(escolhidas)].slice(0, MAX_FOTOS_CIVIL));
    if (input.current) input.current.value = '';
  }

  return (
    <div className="field">
      <span className="campo-rotulo">{rotulo}</span>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        tabIndex={-1}
        onChange={(e) => adicionar(e.target.files)}
      />
      <div className="campo-anexo">
        <button type="button" className="btn btn-outline" disabled={fotos.length >= MAX_FOTOS_CIVIL} onClick={() => input.current?.click()}>
          Anexar fotos
        </button>
      </div>
      {fotos.length > 0 && (
        <ul className="civil-fotos-lista" aria-label={`${rotulo} anexadas`}>
          {fotos.map((foto, i) => (
            <li key={`${foto.name}-${i}`} className="campo-anexo-chip">
              <span className="campo-anexo-nome" title={foto.name}>
                {foto.name}
              </span>
              <button type="button" aria-label={`Remover foto ${foto.name}`} title="Remover foto" onClick={() => onFotos(fotos.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Campos da abertura de manutenção civil: problema na unidade, sala ou instalação, sem equipamento com patrimônio
export function CamposManutencaoCivil({ setores, categorias, abertos, acrescentarEm, onAcrescentar, valor, onChange, fotos, onFotos }: Props) {
  const categoria = categoriaDoChamado(categorias, valor.categoriaCivilId);
  const acrescentando = acrescentarEm !== null;

  function trocarCategoria(id: string) {
    // As respostas são da categoria anterior; e o chamado escolhido para acrescentar deixa de valer
    onAcrescentar(null);
    onChange({ ...valor, categoriaCivilId: id, respostas: {} });
  }

  const responder = (perguntaId: string, resposta: string) => onChange({ ...valor, respostas: { ...valor.respostas, [perguntaId]: resposta } });
  const editarExtra = (i: number, parcial: Partial<ProblemaForm>) =>
    onChange({ ...valor, extras: valor.extras.map((p, j) => (j === i ? { ...p, ...parcial } : p)) });

  return (
    <div className="form-secao">
      <div className="form-secao-titulo">Problema na unidade</div>

      {acrescentando ? (
        <div className="aviso-manutencao" role="status">
          <strong>Acrescentando ao chamado {codigoManutencao(acrescentarEm.numero)}</strong>
          <p>
            O problema abaixo será somado a esse chamado, que continua na triagem.
          </p>
        </div>
      ) : (
        <>
          <div className="field">
            {setores.length > 0 ? (
              <>
                <label htmlFor="civil-setor">Setor afetado *</label>
                <MultiSelecao
                  id="civil-setor"
                  opcoes={setores}
                  valor={valor.setorIds}
                  onChange={(ids) => onChange({ ...valor, setorIds: ids })}
                  placeholder="Selecione um ou mais setores"
                />
              </>
            ) : (
              <>
                <label htmlFor="civil-local">Local afetado *</label>
                <input
                  id="civil-local"
                  maxLength={200}
                  placeholder="Ex.: Recepção, sala de vacinas, telhado do bloco B"
                  value={valor.localAfetado}
                  onChange={(e) => onChange({ ...valor, localAfetado: e.target.value })}
                  required
                />
              </>
            )}
          </div>
          <div className="field">
            <label htmlFor="civil-categoria">Tipo de problema *</label>
            <select id="civil-categoria" value={valor.categoriaCivilId} onChange={(e) => trocarCategoria(e.target.value)} required>
              <option value="">Selecione...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {abertos.length > 0 && (
            <section className="civil-parecidos" role="status" aria-labelledby="civil-abertos-titulo">
              <h4 id="civil-abertos-titulo">
                Já há chamados abertos deste tipo na sua unidade <span className="civil-parecidos-total">{abertos.length}</span>
              </h4>
              <p>Se for o mesmo assunto, acrescente o seu problema a um deles em vez de abrir outro chamado.</p>
              <ul>
                {abertos.map((a) => (
                  <li key={a.id} className="civil-parecido">
                    <Link to={`/manutencoes/${a.id}`} className="civil-parecido-texto" aria-label={`Abrir ${codigoManutencao(a.numero)}`}>
                      <span className="civil-parecido-numero">{codigoManutencao(a.numero)}</span>
                      <span className="civil-parecido-sub">{[a.titulo, a.localAfetado].filter(Boolean).join(' · ')}</span>
                    </Link>
                    <StatusPill valor={statusManutencaoExibido(a).valor}>{statusManutencaoExibido(a).texto}</StatusPill>
                    {a.aceitaProblemas ? (
                      <button type="button" className="btn btn-outline" onClick={() => onAcrescentar(a)}>
                        Acrescentar a este
                      </button>
                    ) : (
                      <span className="dado-apoio">Já está com o prestador</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {categoria?.perguntas.map((p) => (
            <div className="field" key={p.id}>
              <label htmlFor={`civil-pergunta-${p.id}`}>
                {p.texto}
                {p.obrigatoria ? ' *' : ''}
              </label>
              {p.tipo === 'OPCOES' ? (
                <select id={`civil-pergunta-${p.id}`} value={valor.respostas[p.id] ?? ''} onChange={(e) => responder(p.id, e.target.value)}>
                  <option value="">Selecione...</option>
                  {p.opcoes.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <textarea id={`civil-pergunta-${p.id}`} rows={2} maxLength={500} value={valor.respostas[p.id] ?? ''} onChange={(e) => responder(p.id, e.target.value)} />
              )}
            </div>
          ))}
        </>
      )}

      <div className="field">
        <label htmlFor="civil-descricao">Descrição do problema *</label>
        <textarea
          id="civil-descricao"
          rows={3}
          value={valor.descricaoProblema}
          onChange={(e) => onChange({ ...valor, descricaoProblema: e.target.value })}
          required
        />
      </div>
      <CampoFotos id="civil-fotos" fotos={fotos} onFotos={onFotos} />

      {valor.extras.map((p, i) => (
        <div key={i} className="problema-extra" role="group" aria-label={`Problema adicional ${i + 1}`}>
          <div className="problema-extra-titulo">Problema adicional {i + 1}</div>
          <div className="field">
            <label htmlFor={`civil-extra-${i}`}>Descrição *</label>
            <textarea id={`civil-extra-${i}`} rows={2} value={p.descricao} onChange={(e) => editarExtra(i, { descricao: e.target.value })} />
          </div>
          <CampoFotos id={`civil-extra-fotos-${i}`} fotos={p.fotos} onFotos={(f) => editarExtra(i, { fotos: f })} />
          <button
            type="button"
            className="itens-remover problema-extra-remover"
            aria-label={`Remover problema adicional ${i + 1}`}
            title="Remover problema"
            onClick={() => onChange({ ...valor, extras: valor.extras.filter((_, j) => j !== i) })}
          >
            <IconeFechar />
          </button>
        </div>
      ))}
      {(acrescentando || categoria) && valor.extras.length < 20 && (
        <div className="civil-adicionar">
          <button type="button" className="btn btn-link" onClick={() => onChange({ ...valor, extras: [...valor.extras, { descricao: '', fotos: [] }] })}>
            <span>+ Adicionar problema</span>
          </button>
        </div>
      )}
    </div>
  );
}
