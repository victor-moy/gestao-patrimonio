import { Link, Navigate, useParams } from 'react-router-dom';
import { ChatConversa } from '../../components/ChatConversa';
import { useConversas } from '../../hooks/useConversas';
import type { ConversaResumo } from '../../types';
import { caminhoConversa, caminhoMensagens, caminhoOrigem, codigoConversa, tituloConversa, type ContextoConversa } from '../../utils/conversas';
import { formatarDataHora } from '../../utils/format';
import './Conversas.css';

// Lista de conversas no corpo da página: é o ponto de partida no mobile e o estado
// "nenhuma conversa selecionada" no desktop (onde a lista também fica no menu lateral).
export function ListaConversas({ conversas, erro, aoTentar }: { conversas: ConversaResumo[] | null; erro: string | null; aoTentar: () => void }) {
  if (erro && !conversas) {
    return (
      <div className="conversa-vazio" role="alert">
        <span>{erro}</span>
        <button type="button" className="btn btn-outline" onClick={aoTentar}>Tentar novamente</button>
      </div>
    );
  }
  if (!conversas) return <div className="conversa-vazio" role="status">Carregando conversas…</div>;
  if (conversas.length === 0) {
    return (
      <div className="conversa-vazio" role="status">
        Nenhuma conversa ainda. Abra uma solicitação ou manutenção e use “Abrir conversa” para começar.
      </div>
    );
  }
  return (
    <ul className="conversa-lista">
      {conversas.map((c) => (
        <li key={`${c.contexto}-${c.id}`}>
          <Link to={caminhoConversa(c.contexto, c.id)}>
            <strong>
              <span className="req-numero">{codigoConversa(c)}</span>
              {tituloConversa(c)}
            </strong>
            <span>
              {c.ultimoAutor}: {c.ultimoTexto}
            </span>
            <time dateTime={c.ultimaEm}>{formatarDataHora(c.ultimaEm)}</time>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Conversas() {
  const { conversas, erro, recarregar } = useConversas();
  return (
    <section className="gestao-page conversas-page" aria-labelledby="conversas-titulo">
      <div className="page-header">
        <div>
          <h2 id="conversas-titulo">Conversas</h2>
        </div>
      </div>
      <div className="conversa-superficie">
        <ListaConversas conversas={conversas} erro={erro} aoTentar={recarregar} />
      </div>
    </section>
  );
}

// Tela dedicada de uma conversa: título, link para o registro de origem e a conversa em coluna única.
export function ConversaPagina() {
  const { contexto, id } = useParams<{ contexto: string; id: string }>();
  const { conversas } = useConversas();
  if ((contexto !== 'solicitacao' && contexto !== 'manutencao') || !id) return <Navigate to="/conversas" replace />;

  const resumo = conversas?.find((c) => c.contexto === contexto && c.id === id);
  const titulo = resumo ? tituloConversa(resumo) : contexto === 'solicitacao' ? 'Solicitação' : 'Manutenção';
  const origem = contexto === 'solicitacao' ? 'Ver solicitação' : 'Ver manutenção';

  return (
    <section className="gestao-page conversa-pagina" aria-labelledby="conversa-titulo">
      <div className="page-header">
        <div>
          <div className="equipamento-titulo-linha">
            <h2 id="conversa-titulo">{titulo}</h2>
            {resumo && <span className="req-numero req-numero--titulo">{codigoConversa(resumo)}</span>}
          </div>
        </div>
        <div className="inventario-lista-acoes">
          <Link className="btn btn-outline" to={caminhoOrigem(contexto as ContextoConversa, id)}>
            {origem}
          </Link>
        </div>
      </div>
      <div className="conversa-superficie conversa-superficie--chat">
        <ChatConversa
          key={`${contexto}-${id}`}
          id="conversa-dedicada"
          caminho={caminhoMensagens(contexto as ContextoConversa, id)}
        />
      </div>
    </section>
  );
}
