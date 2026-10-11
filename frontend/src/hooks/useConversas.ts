import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ConversaResumo } from '../types';

const EVENTO_ATUALIZAR = 'sgp:conversas-atualizar';

// Avisa todas as listas de conversas abertas (ex.: o menu lateral) que algo mudou, como uma mensagem enviada.
export function avisarConversasAtualizadas() {
  window.dispatchEvent(new Event(EVENTO_ATUALIZAR));
}

// Conversas do usuário, atualizadas ao montar, a cada 30 s com a aba visível e quando avisadas por
// `avisarConversasAtualizadas`.
export function useConversas(ativo = true) {
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .get<ConversaResumo[]>('/conversas')
      .then((lista) => {
        setConversas(lista);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as conversas.'));
  }, []);

  useEffect(() => {
    if (!ativo) return;
    carregar();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') carregar();
    }, 30_000);
    window.addEventListener(EVENTO_ATUALIZAR, carregar);
    return () => {
      clearInterval(timer);
      window.removeEventListener(EVENTO_ATUALIZAR, carregar);
    };
  }, [ativo, carregar]);

  return { conversas, erro, recarregar: carregar };
}

// Total de mensagens não lidas do usuário, para os indicadores (menu, título da aba). Atualiza a cada
// 30 s com a aba visível, ao voltar para a aba e quando avisada por `avisarConversasAtualizadas`.
export function useNaoLidas(ativo = true) {
  const [total, setTotal] = useState(0);

  const carregar = useCallback(() => {
    api
      .get<{ total: number }>('/conversas/nao-lidas', { silencioso: true })
      .then((r) => setTotal(r.total))
      // Falha em segundo plano: mantém o último valor e tenta de novo no próximo ciclo
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    carregar();
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregar();
    };
    const timer = setInterval(aoVoltar, 30_000);
    window.addEventListener(EVENTO_ATUALIZAR, carregar);
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      clearInterval(timer);
      window.removeEventListener(EVENTO_ATUALIZAR, carregar);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [ativo, carregar]);

  return total;
}
