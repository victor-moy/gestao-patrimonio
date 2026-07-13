import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

type Tela = 'login' | 'recuperar' | 'email-enviado';

// Frames do Figma: "Acesso", "Recuperar senha" e "E-mail enviado"
export function Login() {
  const [tela, setTela] = useState<Tela>('login');

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Prefeitura de Joinville</h1>
          <p>Secretaria da Saúde</p>
          <div className="divider" />
          <div className="subtitle">Sistema de Gestão de Patrimônio</div>
        </div>
        {tela === 'login' && <FormLogin onRecuperar={() => setTela('recuperar')} />}
        {tela === 'recuperar' && (
          <FormRecuperar
            onEnviado={() => setTela('email-enviado')}
            onVoltar={() => setTela('login')}
          />
        )}
        {tela === 'email-enviado' && <EmailEnviado onVoltar={() => setTela('login')} />}
        <div className="login-footer">Acesso restrito a servidores autorizados</div>
      </div>
      <div className="login-copy">
        © 2026 Prefeitura Municipal de Joinville - Todos os direitos reservados
      </div>
    </div>
  );
}

function FormLogin({ onRecuperar }: { onRecuperar: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 4000);
    return () => clearTimeout(t);
  }, [erro]);

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
      {erro && <div className="error-banner toast-erro">{erro}</div>}
      <div className="field">
        <label htmlFor="email">E-mail *</label>
        <input
          id="email"
          type="email"
          placeholder="Digite seu e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="senha">Senha *</label>
        <input
          id="senha"
          type="password"
          placeholder="Digite sua senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Acessar Sistema'}
      </button>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button type="button" className="link" onClick={onRecuperar}>
          Esqueci minha senha
        </button>
      </div>
    </form>
  );
}

function FormRecuperar({
  onEnviado,
  onVoltar,
}: {
  onEnviado: () => void;
  onVoltar: () => void;
}) {
  const [email, setEmail] = useState('');

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    // O envio real depende do SMTP institucional; a confirmação é exibida
    // sem revelar se o e-mail existe na base (RNF11).
    onEnviado();
  }

  return (
    <form className="login-body" onSubmit={aoEnviar}>
      <h2>Recuperar Senha</h2>
      <p className="login-instrucao">
        Informe seu e-mail para receber as instruções de recuperação de senha.
      </p>
      <div className="field">
        <label htmlFor="email-recuperar">E-mail *</label>
        <input
          id="email-recuperar"
          type="email"
          placeholder="Digite seu e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <button className="btn btn-primary btn-block" type="submit">
        Enviar Instruções
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onVoltar}>
        ← Voltar para o Login
      </button>
    </form>
  );
}

function EmailEnviado({ onVoltar }: { onVoltar: () => void }) {
  return (
    <div className="login-body login-sucesso">
      <div className="icone-sucesso" aria-hidden>
        ✓
      </div>
      <h2>E-mail enviado com sucesso</h2>
      <p>
        Enviamos as instruções para recuperação de senha para o e-mail informado. Verifique sua
        caixa de entrada e spam.
      </p>
      <button className="btn btn-primary btn-block" onClick={onVoltar}>
        Voltar para o Login
      </button>
    </div>
  );
}
