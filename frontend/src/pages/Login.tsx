import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

export function Login() {
  return (
    <div className="login-page">
      <header className="login-topbar">
        <strong>Gestão Patrimonial</strong>
      </header>
      <main className="login-main">
        <section className="login-card" aria-label="Acesso ao sistema">
          <FormLogin />
          <footer className="login-footer">
            Em caso de dificuldade, procure o suporte responsável pelo sistema.
          </footer>
        </section>
      </main>
    </div>
  );
}

function FormLogin() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao fazer login.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="login-body" onSubmit={aoEnviar}>
      <div className="login-form-header">
        <h1 className="login-titulo">Acessar sua conta</h1>
        <p>Use suas credenciais institucionais para continuar.</p>
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          placeholder="nome@joinville.sc.gov.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          placeholder="••••••••"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
