import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pode, type Permissao } from '../utils/permissoes';

// Redireciona ao início quando o perfil não pode acessar a área (o backend também valida).
// `permissoes`: o Operador precisa de pelo menos uma delas; os demais perfis só dependem de `perfis`.
export function RotaRestrita({
  perfis,
  permissoes,
  children,
}: {
  perfis: string[];
  permissoes?: Permissao[];
  children: ReactNode;
}) {
  const { usuario } = useAuth();
  if (!usuario || !perfis.includes(usuario.perfil)) return <Navigate to="/" replace />;
  if (permissoes && usuario.perfil === 'OPERADOR' && !pode(usuario, ...permissoes)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
