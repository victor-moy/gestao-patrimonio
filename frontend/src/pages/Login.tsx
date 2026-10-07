import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';

type Tela = 'login' | 'recuperar' | 'email-enviado';

// Frames do Figma: "Acesso", "Recuperar senha" e "E-mail enviado"
export function Login() {
  const [tela, setTela] = useState<Tela>('login');
  const { tema, alternarTema } = useTheme();
  const escuro = tema === 'dark';

  return (
    <div className="login-page">
      <button
        type="button"
        className="login-tema"
        onClick={alternarTema}
        aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        title={escuro ? 'Tema claro' : 'Tema escuro'}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          {escuro ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          ) : (
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          )}
        </svg>
      </button>
      <div className="login-visual" aria-hidden>
        <svg className="visual-v" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
          {/* Formas geométricas sobre o tema do sistema: manutenção (engrenagem e porca),
              estoque (caixas empilhadas), inventário (grade), solicitações (lista) e
              relatórios (barras) */}
          {/* Engrenagem */}
          <g transform="translate(190 230)" fill="rgba(255,255,255,0.14)">
            <circle r="66" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(45)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(90)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(135)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(180)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(225)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(270)" />
            <rect x="-14" y="-92" width="28" height="30" rx="6" transform="rotate(315)" />
            <circle r="26" fill="#1d6fa8" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
          </g>

          {/* Porca (hexágono) */}
          <g transform="translate(400 150)">
            <polygon points="0,-46 40,-23 40,23 0,46 -40,23 -40,-23" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
            <circle r="16" fill="#fff" />
          </g>

          {/* Barras (relatórios) */}
          <g fill="rgba(147,197,253,0.4)">
            <rect x="440" y="300" width="26" height="70" rx="6" />
            <rect x="476" y="260" width="26" height="110" rx="6" />
            <rect x="512" y="220" width="26" height="150" rx="6" fill="#fff" />
          </g>
          <path d="M430 384h120" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />

          {/* Lista de solicitações */}
          <g stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
            <path d="M80 420h130M80 460h100M80 500h115" />
          </g>
          <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
            <rect x="46" y="410" width="20" height="20" rx="5" />
            <rect x="46" y="450" width="20" height="20" rx="5" />
            <rect x="46" y="490" width="20" height="20" rx="5" />
          </g>
          <rect x="46" y="410" width="20" height="20" rx="5" fill="#fff" />

          {/* Caixas empilhadas (estoque) */}
          <g fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
            <rect x="250" y="640" width="90" height="90" rx="10" />
            <rect x="350" y="640" width="90" height="90" rx="10" />
            <rect x="450" y="640" width="90" height="90" rx="10" />
            <rect x="300" y="540" width="90" height="90" rx="10" />
            <rect x="400" y="540" width="90" height="90" rx="10" fill="rgba(147,197,253,0.4)" />
          </g>
          <rect x="350" y="440" width="90" height="90" rx="10" fill="#fff" />

          {/* Grade do inventário */}
          <g fill="rgba(255,255,255,0.35)">
            <circle cx="60" cy="640" r="4" /><circle cx="100" cy="640" r="4" /><circle cx="140" cy="640" r="4" /><circle cx="180" cy="640" r="4" />
            <circle cx="60" cy="680" r="4" /><circle cx="100" cy="680" r="4" /><circle cx="140" cy="680" r="4" /><circle cx="180" cy="680" r="4" />
            <circle cx="60" cy="720" r="4" /><circle cx="100" cy="720" r="4" /><circle cx="140" cy="720" r="4" /><circle cx="180" cy="720" r="4" />
          </g>
        </svg>

        {/* Versão horizontal (mobile): mesmos temas, em uma faixa baixa */}
        <svg className="visual-h" viewBox="0 0 600 160" preserveAspectRatio="xMidYMid slice">
          <g stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
            <path d="M58 52h60M58 80h46M58 108h54" />
          </g>
          <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
            <rect x="26" y="43" width="16" height="16" rx="4" />
            <rect x="26" y="71" width="16" height="16" rx="4" />
            <rect x="26" y="99" width="16" height="16" rx="4" />
          </g>
          <rect x="26" y="43" width="16" height="16" rx="4" fill="#fff" />

          <g transform="translate(190 80)" fill="rgba(255,255,255,0.14)">
            <circle r="30" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(45)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(90)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(135)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(180)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(225)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(270)" />
            <rect x="-7" y="-44" width="14" height="15" rx="3" transform="rotate(315)" />
            <circle r="12" fill="#1d6fa8" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
          </g>

          <g transform="translate(280 80)">
            <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
            <circle r="10" fill="#fff" />
          </g>

          <g fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
            <rect x="350" y="92" width="34" height="34" rx="6" />
            <rect x="390" y="92" width="34" height="34" rx="6" />
            <rect x="430" y="92" width="34" height="34" rx="6" />
            <rect x="370" y="52" width="34" height="34" rx="6" fill="rgba(147,197,253,0.4)" />
            <rect x="410" y="52" width="34" height="34" rx="6" />
          </g>
          <rect x="390" y="12" width="34" height="34" rx="6" fill="#fff" />

          <g fill="rgba(147,197,253,0.4)">
            <rect x="500" y="80" width="16" height="44" rx="4" />
            <rect x="524" y="56" width="16" height="68" rx="4" />
            <rect x="548" y="32" width="16" height="92" rx="4" fill="#fff" />
          </g>
        </svg>
      </div>
      <div className="login-panel">
      <div className="login-card">
        {tela === 'login' && <FormLogin onRecuperar={() => setTela('recuperar')} />}
        {tela === 'recuperar' && (
          <FormRecuperar
            onEnviado={() => setTela('email-enviado')}
            onVoltar={() => setTela('login')}
          />
        )}
        {tela === 'email-enviado' && <EmailEnviado onVoltar={() => setTela('login')} />}
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
      <h2 className="login-titulo">Login</h2>
      {erro && <div className="error-banner toast-erro">{erro}</div>}
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
      <button type="button" className="btn btn-ghost btn-block" onClick={onRecuperar}>
        Esqueci minha senha
      </button>
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
      <h2 className="login-titulo">Recuperar senha</h2>
      <div className="field">
        <label htmlFor="email-recuperar">E-mail</label>
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
        Enviar instruções
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
      <h2 className="login-titulo">E-mail enviado</h2>
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
