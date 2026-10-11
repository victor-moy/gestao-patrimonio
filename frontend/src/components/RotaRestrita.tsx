import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Redireciona ao início quando o perfil não pode acessar a área (o backend também valida).
export function RotaRestrita({ perfis, children }: { perfis: string[]; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario || !perfis.includes(usuario.perfil)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
