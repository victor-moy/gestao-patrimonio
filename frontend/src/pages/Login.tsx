import { API_URL } from '../api/client';
import { LogoSistema } from '../components/LogoSistema';

export function Login() {
  return (
    <div className="login-page">
      <main className="login-main">
        <section className="login-card" aria-label="Acesso ao sistema">
          <LogoSistema />
          <h1 className="login-titulo">Gestão Patrimonial</h1>
          <p className="login-subtitulo">Secretaria Municipal da Saúde de Joinville</p>
          {/* É um link, não um botão: leva o navegador ao Keycloak da Prefeitura */}
          <a className="btn login-acao" href={`${API_URL}/auth/oidc/login`}>
            Entrar
          </a>
          <p className="login-footer">Em caso de dificuldade, procure o suporte responsável pelo sistema.</p>
        </section>
      </main>
    </div>
  );
}
