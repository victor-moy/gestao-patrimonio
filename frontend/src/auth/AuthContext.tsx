import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  API_URL,
  api,
  getToken,
  setOnUnauthorized,
  setToken,
} from '../api/client';
import type { Usuario } from '../types';
import { encerrarSessaoInstitucional } from '../utils/navegacao';

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  // Sair por vontade do usuário: encerra também a sessão do Keycloak
  sair: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUsuario(null);
  }, []);

  const sair = useCallback(() => {
    logout();
    encerrarSessaoInstitucional(API_URL);
  }, [logout]);

  useEffect(() => {
    setOnUnauthorized(logout);
    // Volta do Keycloak: o backend entrega o token no fragmento (#token=...) de /login/retorno
    if (window.location.pathname === '/login/retorno') {
      const novoToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (novoToken) setToken(novoToken);
      window.history.replaceState(null, '', '/');
    }
    if (!getToken()) {
      setCarregando(false);
      return;
    }
    api
      .get<Usuario>('/auth/me')
      .then(setUsuario)
      .catch(() => setToken(null))
      .finally(() => setCarregando(false));
  }, [logout]);

  const value = useMemo(
    () => ({ usuario, carregando, sair }),
    [usuario, carregando, sair],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
