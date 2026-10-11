import { Link, Navigate, useParams } from 'react-router-dom';
import { ChatConversa } from '../../components/ChatConversa';
import { ContagemNaoLidas } from '../../components/ContagemNaoLidas';
import { api } from '../../api/client';
import { useCarga } from '../../hooks/useCarga';
import { useConversas } from '../../hooks/useConversas';
import type { ConversaResumo } from '../../types';
import { caminhoConversa, caminhoMensagens, caminhoOrigem, codigoConversa, tituloConversa, type ContextoConversa } from '../../utils/conversas';
import { formatarDataHora } from '../../utils/format';
import './Conversas.css';

// Lista de conversas no corpo da página: ponto de partida no celular (onde o menu lateral fica fechado)
// e também as mensagens de carregando, vazio e erro no computador.
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
        <li key={`${c.contexto}-${c.id}`} className={c.naoLidas > 0 ? 'conversa-nao-lida' : undefined}>
          <Link to={caminhoConversa(c.contexto, c.id)}>
            <strong className="conversa-titulo">
              <span className="req-numero">{codigoConversa(c)}</span>
              <span className="conversa-titulo-texto">{tituloConversa(c)}</span>
            </strong>
            <span className="conversa-previa">
              {c.ultimoAutor}: {c.ultimoTexto}
            </span>
            <span className="conversa-meta">
              <time dateTime={c.ultimaEm}>{formatarDataHora(c.ultimaEm)}</time>
              {c.naoLidas > 0 && <ContagemNaoLidas total={c.naoLidas} />}
            </span>
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
      {/* Celular: o menu lateral fica fechado, então a lista é o ponto de partida no corpo da página */}
      <div className="conversa-superficie conversa-indice-celular">
        <ListaConversas conversas={conversas} erro={erro} aoTentar={recarregar} />
      </div>
      {/* Computador: a lista fica só no menu lateral; aqui, um convite para escolher uma conversa.
          Carregando, vazio e erro continuam sendo mostrados (com nova tentativa). */}
      <div className="conversa-superficie conversa-indice-computador">
        {conversas && conversas.length > 0 ? (
          <div className="conversa-selecione">
            <strong>Selecione uma conversa para ler</strong>
            <span>As conversas ficam no menu ao lado.</span>
          </div>
        ) : (
          <ListaConversas conversas={conversas} erro={erro} aoTentar={recarregar} />
        )}
      </div>
    </section>
  );
}

// Tela dedicada de uma conversa: título (número do pedido), link para o registro de origem e a conversa em coluna única.
export function ConversaPagina() {
  const { contexto, id } = useParams<{ contexto: string; id: string }>();
  if ((contexto !== 'solicitacao' && contexto !== 'manutencao') || !id) return <Navigate to="/conversas" replace />;
  return <ConversaAberta key={`${contexto}-${id}`} contexto={contexto} id={id} />;
}

function ConversaAberta({ contexto, id }: { contexto: ContextoConversa; id: string }) {
  const { conversas } = useConversas();
  const resumo = conversas?.find((c) => c.contexto === contexto && c.id === id);
  // Uma conversa ainda sem mensagens não está na lista: o número vem do próprio registro de origem.
  const { dados: registro } = useCarga<{ numero: number }>(
    () => api.get<{ numero: number }>(caminhoOrigem(contexto, id)),
    conversas !== null && !resumo,
    'Não foi possível carregar a conversa.',
  );

  const numero = resumo?.numero ?? registro?.numero;
  const titulo = numero === undefined ? 'Conversa' : codigoConversa({ contexto, numero });
  const origem = contexto === 'solicitacao' ? 'Ver solicitação' : 'Ver manutenção';

  return (
    <section className="gestao-page conversa-pagina" aria-labelledby="conversa-titulo">
      <div className="page-header">
        <div>
          <h2 id="conversa-titulo">{titulo}</h2>
        </div>
        <div className="inventario-lista-acoes">
          <Link className="btn btn-outline" to={caminhoOrigem(contexto, id)}>
            {origem}
          </Link>
        </div>
      </div>
      <div className="conversa-superficie conversa-superficie--chat">
        <ChatConversa id="conversa-dedicada" caminho={caminhoMensagens(contexto, id)} />
      </div>
    </section>
  );
}
