import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import { BarraCarregamento } from './components/BarraCarregamento';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Inventario } from './pages/Inventario';
import { NovoEquipamento } from './pages/NovoEquipamento';
import { EquipamentoDetalhe } from './pages/EquipamentoDetalhe';
import { Manutencoes } from './pages/Manutencoes';
import { NovaManutencao } from './pages/NovaManutencao';
import { ManutencaoDetalhe } from './pages/ManutencaoDetalhe';
import { Solicitacoes } from './pages/Solicitacoes';
import { SolicitacaoDetalhe } from './pages/SolicitacaoDetalhe';
import { NovaSolicitacao } from './pages/NovaSolicitacao';
import { Estoque } from './pages/Estoque';
import { Atas } from './pages/Atas';
import { AtaFormulario } from './pages/AtaFormulario';
import { Contratos } from './pages/Contratos';
import { ContratoFormulario } from './pages/ContratoFormulario';
import { MovimentacaoEstoque } from './pages/MovimentacaoEstoque';
import { Conversas, ConversaPagina } from './pages/conversas/Conversas';
import { Relatorios } from './pages/Relatorios';
import { RotaRestrita } from './components/RotaRestrita';
import { Usuarios } from './pages/configuracoes/Usuarios';
import { UsuarioFormulario } from './pages/configuracoes/UsuarioFormulario';
import { Unidades } from './pages/configuracoes/Unidades';
import { UnidadeFormulario } from './pages/configuracoes/UnidadeFormulario';
import { Categorias } from './pages/configuracoes/Categorias';
import { CategoriaFormulario } from './pages/configuracoes/CategoriaFormulario';
import { Atendimento } from './pages/configuracoes/Atendimento';
import { Tipos } from './pages/configuracoes/Tipos';
import { TipoFormulario } from './pages/configuracoes/TipoFormulario';

function Restrita({ children }: { children: ReactNode }) {
  return <RotaRestrita perfis={['GESTOR_PATRIMONIO']}>{children}</RotaRestrita>;
}

function RotasProtegidas() {
  const { usuario, carregando } = useAuth();
  if (carregando) {
    return (
      <div className="tela-carregando" role="status">
        <span className="spinner" aria-hidden />
        Carregando…
      </div>
    );
  }
  if (!usuario) {
    return <Login />;
  }

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/inventario/novo" element={<NovoEquipamento />} />
          <Route path="/inventario/:id" element={<EquipamentoDetalhe />} />
          <Route path="/manutencoes" element={<Manutencoes />} />
          <Route path="/manutencoes/nova" element={<NovaManutencao />} />
          <Route path="/manutencoes/:id" element={<ManutencaoDetalhe />} />
          <Route path="/solicitacoes" element={<Solicitacoes />} />
          <Route path="/solicitacoes/nova" element={<NovaSolicitacao />} />
          <Route path="/solicitacoes/:id" element={<SolicitacaoDetalhe />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/estoque/movimentar" element={<MovimentacaoEstoque />} />
          <Route path="/relatorios" element={<Navigate to="/relatorios/visao-geral" replace />} />
          <Route path="/relatorios/:relatorio" element={<Relatorios />} />
          <Route path="/configuracoes" element={<Navigate to="/configuracoes/usuarios" replace />} />
          <Route path="/configuracoes/usuarios" element={<Restrita><Usuarios /></Restrita>} />
          <Route path="/configuracoes/usuarios/novo" element={<Restrita><UsuarioFormulario /></Restrita>} />
          <Route path="/configuracoes/usuarios/:id" element={<Restrita><UsuarioFormulario /></Restrita>} />
          <Route path="/configuracoes/unidades" element={<Restrita><Unidades /></Restrita>} />
          <Route path="/configuracoes/unidades/nova" element={<Restrita><UnidadeFormulario /></Restrita>} />
          <Route path="/configuracoes/unidades/:id" element={<Restrita><UnidadeFormulario /></Restrita>} />
          <Route path="/configuracoes/categorias" element={<Restrita><Categorias /></Restrita>} />
          <Route path="/configuracoes/categorias/nova" element={<Restrita><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/categorias/:id" element={<Restrita><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/atendimento" element={<Restrita><Atendimento /></Restrita>} />
          <Route path="/configuracoes/tipos" element={<Restrita><Tipos /></Restrita>} />
          <Route path="/configuracoes/tipos/novo" element={<Restrita><TipoFormulario /></Restrita>} />
          <Route path="/configuracoes/tipos/:id" element={<Restrita><TipoFormulario /></Restrita>} />
          <Route path="/conversas" element={<Conversas />} />
          <Route path="/conversas/:contexto/:id" element={<ConversaPagina />} />
          <Route path="/atas" element={<Atas />} />
          <Route path="/atas/nova" element={<AtaFormulario />} />
          <Route path="/atas/:id" element={<AtaFormulario />} />
          <Route path="/contratos" element={<Contratos />} />
          <Route path="/contratos/novo" element={<ContratoFormulario />} />
          <Route path="/contratos/:id" element={<ContratoFormulario />} />
          <Route path="/usuarios" element={<Navigate to="/configuracoes/usuarios" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <BarraCarregamento />
          <RotasProtegidas />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
