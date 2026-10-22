import type { ReactNode } from 'react';
import { LogoSistema } from './LogoSistema';

// Moldura das telas antes de entrar no sistema (login e "aguardando liberação")
export function TelaAcesso({ rotulo, titulo, subtitulo, children }: { rotulo: string; titulo: string; subtitulo: ReactNode; children: ReactNode }) {
  return (
    <div className="login-page">
      <main className="login-main">
        <section className="login-card" aria-label={rotulo}>
          <LogoSistema />
          <h1 className="login-titulo">{titulo}</h1>
          <p className="login-subtitulo">{subtitulo}</p>
          {children}
        </section>
      </main>
    </div>
  );
}
