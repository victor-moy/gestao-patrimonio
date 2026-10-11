import { useEffect } from 'react';

// Mostra a mensagem no alerta nativo do navegador (window.alert) assim que ela aparece e a
// limpa em seguida. Usado para erros de ação, que precisam de reconhecimento explícito.
export function useAlertaNativo(mensagem: string | null, aoExibir: () => void) {
  useEffect(() => {
    if (!mensagem) return;
    window.alert(mensagem);
    aoExibir();
    // aoExibir costuma ser uma função inline; o alerta só deve disparar quando a mensagem muda
  }, [mensagem]);
}
