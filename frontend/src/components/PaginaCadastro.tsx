import type { ReactNode } from 'react';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

interface Props {
  id: string;
  titulo: string;
  formId: string;
  onCancelar: () => void;
  desabilitarSalvar: boolean;
  enviando: boolean;
  erro: string | null;
  // Chamado depois que o alerta nativo do erro foi exibido (para o formulário limpar o erro)
  aoExibirErro: () => void;
  carregando: boolean;
  falha: string | null;
  // Ações secundárias (ex.: Excluir) exibidas antes de Cancelar
  acoesExtras?: ReactNode;
  children: ReactNode;
  onEnviar: (e: React.FormEvent) => void;
}

// Casca das páginas de cadastro/edição: título, Cancelar/Salvar no topo e feedback.
export function PaginaCadastro({
  id,
  titulo,
  formId,
  onCancelar,
  desabilitarSalvar,
  enviando,
  erro,
  aoExibirErro,
  carregando,
  falha,
  acoesExtras,
  children,
  onEnviar,
}: Props) {
  useAlertaNativo(erro, aoExibirErro);
  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby={`${id}-titulo`}>
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id={`${id}-titulo`}>{titulo}</h2>
        </div>
        <div className="novo-equipamento-acoes">
          {acoesExtras}
          <button type="button" className="btn btn-outline" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            className="btn btn-primary"
            disabled={enviando || carregando || Boolean(falha) || desabilitarSalvar}
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {carregando && <p className="novo-equipamento-estado" role="status">Carregando…</p>}
      {falha && <div className="error-banner" role="alert">{falha}</div>}

      <form id={formId} onSubmit={onEnviar}>
        {children}
      </form>
    </section>
  );
}
