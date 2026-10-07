import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import './Login.css';

type Tela = 'login' | 'recuperar';

// Frames do Figma: "Acesso", "Recuperar senha" e "E-mail enviado"
export function Login() {
  const [tela, setTela] = useState<Tela>('login');
  const { tema, alternarTema } = useTheme();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div><h1>Prefeitura de Joinville</h1>
          <p>Secretaria da Saúde</p>
          </div>
          <button type="button" className="login-tema" onClick={alternarTema} aria-label={tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>{tema === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
        </div>
        {tela === 'login' && <FormLogin onRecuperar={() => setTela('recuperar')} />}
        {tela === 'recuperar' && (
          <FormRecuperar
            onVoltar={() => setTela('login')}
          />
        )}
        <div className="login-visual" aria-hidden>
          <div className="login-apresentacao"><span>Patrimônio · Saúde</span><h2>Organização que apoia<br />o cuidado.</h2><p>Equipamentos, solicitações e unidades.<br />Tudo conectado em um só lugar.</p></div>
          <div className="login-visual-window">
            <div className="login-visual-bar"><i /><i /><i /><span>Patrimônio · Painel</span></div>
            <div className="login-visual-card"><small>VISÃO GERAL</small><strong>Um patrimônio bem cuidado.</strong><span>Inventário · Solicitações · Relatórios</span></div>
            <div className="login-visual-lines"><b /><b /><b /><b /></div>
          </div>
        </div>
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
      <span className="login-eyebrow">Sistema de Gestão de Patrimônio</span>
      <h2>Bem-vindo de volta.</h2>
      <p className="login-instrucao">Entre com sua conta para continuar.</p>
      {erro && <div className="error-banner toast-erro">{erro}</div>}
      <div className="field">
        <label htmlFor="email">E-mail *</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
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
          autoComplete="current-password"
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

function FormRecuperar({ onVoltar }: { onVoltar: () => void }) {
  return (
    <div className="login-body">
      <h2>Recuperar senha</h2>
      <p className="login-instrucao">
        A recuperação automática por e-mail ainda não está disponível.
        Entre em contato com o responsável pelo sistema na sua unidade para recuperar o acesso.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={onVoltar}>
        Voltar para o login
      </button>
    </div>
  );
}
