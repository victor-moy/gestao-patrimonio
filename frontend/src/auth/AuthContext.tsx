import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  API_URL,
  api,
  getToken,
  getTokenMestre,
  limparTokenMestre,
  setOnUnauthorized,
  setToken,
  setTokenMestre,
} from '../api/client';
import type { Usuario } from '../types';
import { encerrarSessaoInstitucional, recarregarNoInicio } from '../utils/navegacao';

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  impersonando: boolean;
  // O Administrador troca de usuário, também enquanto está dentro de outro usuário
  podeTrocarUsuario: boolean;
  // Sair por vontade do usuário: encerra também a sessão do Keycloak
  sair: () => void;
  entrarComo: (usuarioId: string) => Promise<void>;
  // Volta à própria conta do administrador (o token dele fica guardado enquanto assume outro usuário)
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

  // O Administrador "entra como" outro usuário — guarda o próprio token
  // pra dar pra voltar depois, sem precisar logar de novo.
  const entrarComo = useCallback(async (usuarioId: string) => {
    const tokenAtual = getToken();
    // Já dentro de outro usuário? A troca é autorizada pelo token do administrador, que continua guardado
    const jaImpersonando = Boolean(getTokenMestre());
    const resposta = await api.post<{ token: string; usuario: Usuario }>(
      `/auth/impersonar/${usuarioId}`,
      undefined,
      { comoMestre: jaImpersonando },
    );
    if (tokenAtual && !jaImpersonando) {
      setTokenMestre(tokenAtual);
    }
    setToken(resposta.token);
    setUsuario(resposta.usuario);
    setImpersonando(true);
    recarregarNoInicio();
  }, []);

  const voltarAoMestre = useCallback(async () => {
    const tokenMestre = getTokenMestre();
    if (!tokenMestre) return;
    limparTokenMestre();
    setToken(tokenMestre);
    setImpersonando(false);
    try {
      setUsuario(await api.get<Usuario>('/auth/me'));
      recarregarNoInicio();
    } catch {
      logout();
    }
  }, [logout]);

  const podeTrocarUsuario =
    impersonando || usuario?.perfil === 'OPERADOR';
  const value = useMemo(
    () => ({ usuario, carregando, impersonando, podeTrocarUsuario, sair, entrarComo, voltarAoMestre }),
    [usuario, carregando, impersonando, podeTrocarUsuario, sair, entrarComo, voltarAoMestre],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
