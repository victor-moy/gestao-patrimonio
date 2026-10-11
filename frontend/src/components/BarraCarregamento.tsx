import { useEffect, useState, useSyncExternalStore } from 'react';
import { assinarRequisicoes, requisicoesPendentes } from '../api/client';

const ATRASO_MS = 120; // evita piscar em respostas instantâneas
const PERMANENCIA_MIN_MS = 450; // depois de aparecer, não some antes disso

// Barra fina no topo da janela enquanto há requisições à API em andamento (troca de tela, login,
// ações). Suaviza a navegação: o usuário vê que algo está carregando em vez de uma tela parada.
export function BarraCarregamento() {
  const pendentes = useSyncExternalStore(assinarRequisicoes, requisicoesPendentes);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (pendentes > 0) {
      const timer = setTimeout(() => setVisivel(true), ATRASO_MS);
      return () => clearTimeout(timer);
    }
    if (!visivel) return;
    const timer = setTimeout(() => setVisivel(false), PERMANENCIA_MIN_MS);
    return () => clearTimeout(timer);
  }, [pendentes, visivel]);

  return (
    <div className={`barra-carregamento${visivel ? ' ativa' : ''}`} role="progressbar" aria-label="Carregando" aria-hidden={!visivel} />
  );
}
