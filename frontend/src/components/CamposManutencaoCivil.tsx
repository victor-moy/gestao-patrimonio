import { useRef } from 'react';
import type { CategoriaProblemaCivil } from '../types';
import { ROTULO_CATEGORIA_CIVIL } from '../utils/manutencao';

export const MAX_FOTOS_CIVIL = 4;
export const DESCRICAO_CIVIL_MIN = 5;

export interface DadosCivil {
  localAfetado: string;
  categoriaCivil: CategoriaProblemaCivil | '';
  descricaoProblema: string;
}

interface Props {
  valor: DadosCivil;
  onChange: (proximo: DadosCivil) => void;
  fotos: File[];
  onFotos: (fotos: File[]) => void;
}

export const civilIncompleto = (v: DadosCivil) =>
  v.localAfetado.trim().length < 2 || !v.categoriaCivil || v.descricaoProblema.trim().length < DESCRICAO_CIVIL_MIN;

// Campos da abertura de manutenção civil: problema na unidade, sala ou instalação, sem equipamento com patrimônio
export function CamposManutencaoCivil({ valor, onChange, fotos, onFotos }: Props) {
  const input = useRef<HTMLInputElement>(null);

  function adicionar(escolhidas: FileList | null) {
    if (!escolhidas) return;
    onFotos([...fotos, ...Array.from(escolhidas)].slice(0, MAX_FOTOS_CIVIL));
    if (input.current) input.current.value = '';
  }

  return (
    <div className="form-secao">
      <div className="form-secao-titulo">Problema na unidade</div>
      <div className="field">
        <label htmlFor="civil-local">Local afetado *</label>
        <input
          id="civil-local"
          maxLength={200}
          placeholder="Ex.: Recepção, sala de vacinas, telhado do bloco B"
          value={valor.localAfetado}
          onChange={(e) => onChange({ ...valor, localAfetado: e.target.value })}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="civil-categoria">Tipo de problema *</label>
        <select
          id="civil-categoria"
          value={valor.categoriaCivil}
          onChange={(e) => onChange({ ...valor, categoriaCivil: e.target.value as CategoriaProblemaCivil | '' })}
          required
        >
          <option value="">Selecione...</option>
          {Object.entries(ROTULO_CATEGORIA_CIVIL).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>
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
      <div className="field">
        <span className="campo-rotulo">Fotos</span>
        <input
          ref={input}
          id="civil-fotos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: 'none' }}
          tabIndex={-1}
          onChange={(e) => adicionar(e.target.files)}
        />
        <div className="campo-anexo">
          <button
            type="button"
            className="btn btn-outline"
            disabled={fotos.length >= MAX_FOTOS_CIVIL}
            onClick={() => input.current?.click()}
          >
            Anexar fotos
          </button>
        </div>
        {fotos.length > 0 && (
          <ul className="civil-fotos-lista" aria-label="Fotos anexadas">
            {fotos.map((foto, i) => (
              <li key={`${foto.name}-${i}`} className="campo-anexo-chip">
                <span className="campo-anexo-nome" title={foto.name}>
                  {foto.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remover foto ${foto.name}`}
                  title="Remover foto"
                  onClick={() => onFotos(fotos.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
