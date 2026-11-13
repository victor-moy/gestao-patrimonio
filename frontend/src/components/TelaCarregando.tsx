import type { ReactNode } from 'react';
import { LogoSistema } from './LogoSistema';

// Tela inteira com a logo do sistema: o carregando da abertura (conferir a sessão, ir ao Keycloak) e a falha de login
// usam a mesma, para a troca de uma para a outra não piscar.
export function TelaCarregando({ children, alerta = false }: { children?: ReactNode; alerta?: boolean }) {
  return (
    <div className="tela-carregando" role={alerta ? 'alert' : 'status'}>
      <LogoSistema tamanho={56} />
      {children ?? (
        <span className="tela-carregando-linha">
          <span className="spinner" aria-hidden />
          Carregando…
        </span>
      )}
    </div>
  );
}
