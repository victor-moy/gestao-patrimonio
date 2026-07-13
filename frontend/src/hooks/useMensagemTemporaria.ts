import { useEffect, useState } from 'react';

// Mensagem de sucesso que desaparece sozinha após alguns segundos
export function useMensagemTemporaria(
  duracaoMs = 4000,
): [string | null, (mensagem: string | null) => void] {
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const timer = setTimeout(() => setMensagem(null), duracaoMs);
    return () => clearTimeout(timer);
  }, [mensagem, duracaoMs]);

  return [mensagem, setMensagem];
}
