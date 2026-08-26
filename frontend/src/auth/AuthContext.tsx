import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  getToken,
  getTokenMestre,
  limparTokenMestre,
  setOnUnauthorized,
  setToken,
  setTokenMestre,
} from '../api/client';
import type { Usuario } from '../types';

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  impersonando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  entrarComo: (usuarioId: string) => Promise<void>;
  voltarAoMestre: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [impersonando, setImpersonando] = useState(() => Boolean(getTokenMestre()));

  const logout = useCallback(() => {
    setToken(null);
    limparTokenMestre();
    setImpersonando(false);
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

  // Gestor de Patrimônio "entra como" outro usuário — guarda o próprio token
  // pra dar pra voltar depois, sem precisar logar de novo.
  const entrarComo = useCallback(async (usuarioId: string) => {
    const tokenAtual = getToken();
    const resposta = await api.post<{ token: string; usuario: Usuario }>(
      `/auth/impersonar/${usuarioId}`,
    );
    if (tokenAtual && !getTokenMestre()) {
      setTokenMestre(tokenAtual);
    }
    setToken(resposta.token);
    setUsuario(resposta.usuario);
    setImpersonando(true);
  }, []);

  const voltarAoMestre = useCallback(async () => {
    const tokenMestre = getTokenMestre();
    if (!tokenMestre) return;
    limparTokenMestre();
    setToken(tokenMestre);
    setImpersonando(false);
    try {
      const usuarioMestre = await api.get<Usuario>('/auth/me');
      setUsuario(usuarioMestre);
    } catch {
      logout();
    }
  }, [logout]);

  const value = useMemo(
    () => ({ usuario, carregando, impersonando, login, logout, entrarComo, voltarAoMestre }),
    [usuario, carregando, impersonando, login, logout, entrarComo, voltarAoMestre],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
