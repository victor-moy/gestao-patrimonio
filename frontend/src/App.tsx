import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Inventario } from './pages/Inventario';
import { Manutencoes } from './pages/Manutencoes';
import { Solicitacoes } from './pages/Solicitacoes';
import { NovaSolicitacao } from './pages/NovaSolicitacao';
import { Estoque } from './pages/Estoque';
import { Relatorios } from './pages/Relatorios';
import { Configuracoes } from './pages/Configuracoes';

function RotasProtegidas() {
  const { usuario, carregando } = useAuth();
  const location = useLocation();
  if (carregando) {
    return <div className="empty-state">Carregando...</div>;
  }
  if (!usuario) {
    return <Login />;
  }

  // Modal de Configurações sobrepõe a página atual (padrão do Figma):
  // quando aberto por navegação interna, a rota de origem segue
  // renderizada atrás; em acesso direto pela URL, o Início serve de fundo.
  const state = location.state as { background?: Location } | null;
  const background = state?.background;
  const configuracoesAberto = location.pathname === '/configuracoes';

  return (
    <>
      <Routes location={background ?? location}>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/manutencoes" element={<Manutencoes />} />
          <Route path="/solicitacoes" element={<Solicitacoes />} />
          <Route path="/solicitacoes/nova" element={<NovaSolicitacao />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Inicio />} />
          <Route path="/atas" element={<Navigate to="/configuracoes?secao=atas" replace />} />
          <Route path="/usuarios" element={<Navigate to="/configuracoes?secao=usuarios" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {configuracoesAberto && <Configuracoes />}
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RotasProtegidas />
      </BrowserRouter>
    </AuthProvider>
  );
}
