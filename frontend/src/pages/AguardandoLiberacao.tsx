import { useAuth } from '../auth/AuthContext';
import { TelaAcesso } from '../components/TelaAcesso';

// Quem entrou pelo Keycloak e ainda não recebeu perfil: o backend só deixa ver /auth/me até um Administrador liberar.
export function AguardandoLiberacao() {
  const { usuario, sair } = useAuth();
  return (
    <TelaAcesso
      rotulo="Acesso aguardando liberação"
      titulo="Aguardando liberação"
      subtitulo={
        <>
          Você entrou como <strong>{usuario?.nome}</strong> ({usuario?.email}), mas ainda não tem um perfil neste
          sistema. Peça a um Administrador do SGP para liberar o seu acesso e entre novamente.
        </>
      }
    >
      <button className="btn login-acao" type="button" onClick={sair}>
        Sair
      </button>
    </TelaAcesso>
  );
}
