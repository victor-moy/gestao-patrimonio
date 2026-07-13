import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setOnUnauthorized, setToken } from '../api/client';
import type { Usuario } from '../types';

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUsuario(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(logout);
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

  const login = useCallback(async (email: string, senha: string) => {
    const resposta = await api.post<{ token: string; usuario: Usuario }>('/auth/login', {
      email,
      senha,
    });
    setToken(resposta.token);
    setUsuario(resposta.usuario);
  }, []);

  const value = useMemo(
    () => ({ usuario, carregando, login, logout }),
    [usuario, carregando, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
