import { useEffect, useState } from 'react';
import { API_URL } from '../api/client';
import { TelaAcesso } from '../components/TelaAcesso';

// O backend manda o navegador para /login/retorno?erro=... quando o retorno do Keycloak falha
// A leitura não pode ter efeito colateral: o React (modo de desenvolvimento) executa o inicializador duas vezes.
function erroDoRetorno() {
  if (window.location.pathname !== '/login/retorno') return null;
  return new URLSearchParams(window.location.search).has('erro');
}

export function Login() {
  const [erro] = useState(erroDoRetorno);
  // Depois de guardado o erro, limpa o endereço para ele não reaparecer ao recarregar
  useEffect(() => {
    if (window.location.pathname === '/login/retorno') window.history.replaceState(null, '', '/');
  }, []);
  return (
    <TelaAcesso
      rotulo="Acesso ao sistema"
      titulo="Gestão Patrimonial"
      subtitulo="Secretaria Municipal da Saúde de Joinville"
    >
      {erro && (
        <p className="login-erro" role="alert">
          Houve um erro na autenticação, tente novamente.
        </p>
      )}
      {/* É um link, não um botão: leva o navegador ao Keycloak da Prefeitura */}
      <a className="btn login-acao" href={`${API_URL}/auth/oidc/login`}>
        Entrar
      </a>
      <p className="login-footer">Em caso de dificuldade, procure o suporte responsável pelo sistema.</p>
    </TelaAcesso>
  );
}
