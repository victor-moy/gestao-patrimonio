import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { IconeSetaCima } from './icons';
import type { MensagemChat } from '../types';
import { formatarDataHora } from '../utils/format';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const INTERVALO_ATUALIZACAO_MS = 10_000;
const LIMITE_TEXTO = 2000;

interface ChatConversaProps {
  // Caminho da conversa na API, ex.: /solicitacoes/<id>/mensagens
  caminho: string;
  // Prefixo dos ids (único por tela)
  id: string;
}

// Conversa dentro de uma solicitação ou manutenção. As mensagens são imutáveis e a
// lista se atualiza sozinha enquanto a aba está visível (sem conexão persistente).
export function ChatConversa({ caminho, id }: ChatConversaProps) {
  const { usuario } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemChat[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  useAlertaNativo(erroEnvio, () => setErroEnvio(null));
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const noFim = useRef(true);
  const campo = useRef<HTMLTextAreaElement>(null);
  const ultima = useRef<string | null>(null);

  const acrescentar = useCallback((novas: MensagemChat[]) => {
    if (novas.length === 0) return;
    setMensagens((atuais) => {
      const existentes = new Set((atuais ?? []).map((m) => m.id));
      const unicas = novas.filter((m) => !existentes.has(m.id));
      return unicas.length === 0 ? atuais : [...(atuais ?? []), ...unicas];
    });
    ultima.current = novas[novas.length - 1].criadoEm;
  }, []);

  const carregar = useCallback(
    async (apenasNovas: boolean) => {
      try {
        const parametro = apenasNovas && ultima.current ? `?depois=${encodeURIComponent(ultima.current)}` : '';
        const recebidas = await api.get<MensagemChat[]>(`${caminho}${parametro}`);
        if (!Array.isArray(recebidas)) throw new Error('Resposta inesperada ao carregar a conversa.');
        setFalha(null);
        if (apenasNovas) acrescentar(recebidas);
        else {
          setMensagens(recebidas);
          ultima.current = recebidas.at(-1)?.criadoEm ?? null;
        }
      } catch (e) {
        // Uma falha ao atualizar em segundo plano não apaga a conversa já exibida
        if (!apenasNovas) setFalha(e instanceof Error ? e.message : 'Não foi possível carregar a conversa.');
      }
    },
    [caminho, acrescentar],
  );

  useEffect(() => {
    setMensagens(null);
    ultima.current = null;
    carregar(false);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') carregar(true);
    }, INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(timer);
  }, [carregar]);

  // Mantém a conversa rolada até o fim, a menos que a pessoa esteja lendo mensagens antigas
  useEffect(() => {
    const el = lista.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [mensagens]);

  // O campo cresce com o texto (até ~5 linhas)
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [texto]);

  function aoRolar() {
    const el = lista.current;
    if (el) noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const criada = await api.post<MensagemChat>(caminho, { texto: conteudo });
      noFim.current = true;
      acrescentar([criada]);
      setTexto('');
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <section className="chat-pagina" aria-label="Conversa">

      {falha && !mensagens ? (
        <div className="chat-estado" role="alert">
          <span>{falha}</span>
          <button type="button" className="btn btn-outline" onClick={() => carregar(false)}>
            Tentar novamente
          </button>
        </div>
      ) : !mensagens ? (
        <div className="chat-estado" role="status">Carregando conversa…</div>
      ) : mensagens.length === 0 ? (
        <div className="chat-estado" role="status">Nenhuma mensagem ainda. Escreva a primeira.</div>
      ) : (
        <ol
          ref={lista}
          className="chat-lista"
          onScroll={aoRolar}
          aria-live="polite"
          aria-label="Mensagens da conversa"
          tabIndex={0}
        >
          {mensagens.map((m) => {
            const minha = m.autor.id === usuario?.id;
            return (
              <li key={m.id} className={`chat-mensagem${minha ? ' chat-mensagem--minha' : ''}`}>
                <div className="chat-meta">
                  <strong>{minha ? 'Você' : m.autor.nome}</strong>
                  <time dateTime={m.criadoEm}>{formatarDataHora(m.criadoEm)}</time>
                </div>
                <p>{m.texto}</p>
              </li>
            );
          })}
        </ol>
      )}

      <form className="chat-formulario" onSubmit={enviar}>
        <label className="gestao-sr-only" htmlFor={`${id}-texto`}>Mensagem</label>
        <div className="chat-entrada">
          <textarea
            id={`${id}-texto`}
            ref={campo}
            rows={1}
            maxLength={LIMITE_TEXTO}
            placeholder="Escreva uma mensagem"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
          />
          <button
            type="submit"
            className="chat-enviar"
            disabled={enviando || !texto.trim()}
            aria-label={enviando ? 'Enviando mensagem' : 'Enviar mensagem'}
            title="Enviar (Ctrl + Enter)"
          >
            <IconeSetaCima />
          </button>
        </div>
        {texto.length >= LIMITE_TEXTO - 200 && (
          <span className="chat-contador">{texto.length}/{LIMITE_TEXTO}</span>
        )}
      </form>
    </section>
  );
}
