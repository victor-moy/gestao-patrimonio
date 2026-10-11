import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ConversaResumo } from '../types';

// Conversas do usuário, atualizadas ao montar e a cada 30 s com a aba visível.
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
    return () => clearInterval(timer);
  }, [ativo, carregar]);

  return { conversas, erro, recarregar: carregar };
}
