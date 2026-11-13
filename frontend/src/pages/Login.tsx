import { useEffect } from 'react';
import { API_URL } from '../api/client';
import { TelaCarregando } from '../components/TelaCarregando';
import { irParaLoginInstitucional } from '../utils/navegacao';

const URL_LOGIN = `${API_URL}/auth/oidc/login`;

// Sem sessão não há tela de login: o navegador segue direto ao Keycloak da Prefeitura, e enquanto isso fica só o
// carregando. Se o login falhou (o backend volta com ?erro=login, ou a sessão não pôde ser aberta), mostra o erro
// com a opção de tentar de novo, e não redireciona sozinho, para a falha não virar um ciclo.
export function Login({ falha = false }: { falha?: boolean }) {
  const falhou = falha || new URLSearchParams(window.location.search).get('erro') === 'login';

  useEffect(() => {
    if (!falhou) irParaLoginInstitucional(API_URL);
  }, [falhou]);

  if (!falhou) return <TelaCarregando />;

  return (
    <TelaCarregando alerta>
      <p className="tela-carregando-mensagem">Não foi possível entrar. Tente novamente em instantes.</p>
      <a className="btn btn-primary" href={URL_LOGIN}>
        Tentar novamente
      </a>
    </TelaCarregando>
  );
}
