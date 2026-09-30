import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { MensagemAssistente } from '../types';
import { IconeChat, IconeFechar } from './icons';

const PERGUNTAS_EXEMPLO = [
  'Qual item tem maior quantidade aguardando estoque?',
  'Quais unidades mais abriram solicitações?',
  'Tem algum empréstimo atrasado?',
];

function chaveArmazenamento(usuarioId: string) {
  return `sgp:assistente:${usuarioId}`;
}

function lerMensagensSalvas(usuarioId: string): MensagemAssistente[] {
  try {
    const salvo = localStorage.getItem(chaveArmazenamento(usuarioId));
    return salvo ? JSON.parse(salvo) : [];
  } catch {
    return [];
  }
}

// Botão flutuante acessível em qualquer tela (monta uma vez no Layout) —
// abre um painel de chat com o assistente de IA dos relatórios. A conversa
// persiste em localStorage por usuário, então sobrevive a abrir/fechar o
// painel e a recarregar a página (mas não troca entre navegadores/dispositivos).
export function AssistenteFlutuante() {
  const { usuario } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>(() =>
    usuario ? lerMensagensSalvas(usuario.id) : [],
  );
  const [entrada, setEntrada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!usuario) return;
    try {
      localStorage.setItem(chaveArmazenamento(usuario.id), JSON.stringify(mensagens));
    } catch {
      // Armazenamento indisponível (modo privado, etc.) — a conversa
      // continua funcionando nesta sessão, só não persiste.
    }
  }, [mensagens, usuario]);

  useEffect(() => {
    if (!aberto) return;
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensagens, enviando, aberto]);

  if (!usuario || usuario.perfil !== 'GESTOR_PATRIMONIO') return null;

  async function enviar(pergunta: string) {
    const texto = pergunta.trim();
    if (!texto || enviando) return;
    setErro(null);
    const novasMensagens: MensagemAssistente[] = [...mensagens, { role: 'user', content: texto }];
    setMensagens(novasMensagens);
    setEntrada('');
    setEnviando(true);
    try {
      const { resposta } = await api.post<{ resposta: string }>('/assistente/perguntar', { mensagens: novasMensagens });
      setMensagens([...novasMensagens, { role: 'assistant', content: resposta }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao falar com o assistente.');
    } finally {
      setEnviando(false);
    }
  }

  function limparConversa() {
    setMensagens([]);
    setErro(null);
  }

  return (
    <>
      {aberto && (
        <div className="assistente-flutuante-painel">
          <div className="assistente-flutuante-cabecalho">
            <span>Assistente de IA</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {mensagens.length > 0 && (
                <button type="button" className="assistente-limpar" onClick={limparConversa}>
                  Limpar
                </button>
              )}
              <button type="button" className="assistente-flutuante-fechar" onClick={() => setAberto(false)} aria-label="Fechar">
                <IconeFechar />
              </button>
            </div>
          </div>

          <div className="assistente-lista" ref={listaRef}>
            {mensagens.length === 0 && (
              <div className="assistente-vazio">
                <p>Pergunte sobre solicitações, empréstimos, unidades ou itens aguardando estoque.</p>
                <div className="assistente-exemplos">
                  {PERGUNTAS_EXEMPLO.map((pergunta) => (
                    <button type="button" key={pergunta} className="assistente-exemplo" onClick={() => enviar(pergunta)}>
                      {pergunta}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensagens.map((m, i) => (
              <div key={i} className={`assistente-mensagem assistente-mensagem--${m.role}`}>
                {m.content}
              </div>
            ))}
            {enviando && (
              <div className="assistente-mensagem assistente-mensagem--assistant assistente-digitando">Pensando…</div>
            )}
          </div>

          {erro && <div className="error-banner">{erro}</div>}

          <form
            className="assistente-form"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(entrada);
            }}
          >
            <input
              type="text"
              placeholder="Pergunte algo sobre os dados de solicitações..."
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              disabled={enviando}
            />
            <button type="submit" className="btn btn-primary" disabled={enviando || !entrada.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="assistente-flutuante-botao"
        onClick={() => setAberto((a) => !a)}
        aria-label={aberto ? 'Fechar assistente de IA' : 'Abrir assistente de IA'}
      >
        {aberto ? <IconeFechar /> : <IconeChat />}
      </button>
    </>
  );
}
