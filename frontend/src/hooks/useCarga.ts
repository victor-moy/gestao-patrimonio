import { useEffect, useRef, useState } from 'react';

// Carrega dados uma vez quando `ativo` e expõe estado de carregamento/falha.
export function useCarga<T>(carregar: () => Promise<T>, ativo: boolean, mensagemFalha: string) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(ativo);
  const [falha, setFalha] = useState<string | null>(null);
  const funcao = useRef(carregar);
  funcao.current = carregar;

  useEffect(() => {
    if (!ativo) {
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    funcao
      .current()
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setFalha(e instanceof Error && e.message ? e.message : mensagemFalha))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [ativo, mensagemFalha]);

  return { dados, carregando, falha, definirFalha: setFalha };
}
