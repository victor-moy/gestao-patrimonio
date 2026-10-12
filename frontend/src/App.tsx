import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { BarraCarregamento } from './components/BarraCarregamento';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Inicio } from './pages/Inicio';
import { Inventario } from './pages/Inventario';
import { NovoEquipamento } from './pages/NovoEquipamento';
import { EquipamentoDetalhe } from './pages/EquipamentoDetalhe';
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
import { Prestadores } from './pages/configuracoes/Prestadores';
import { PrestadorFormulario } from './pages/configuracoes/PrestadorFormulario';
import { ServicosContrato } from './pages/configuracoes/ServicosContrato';
import { ServicoContratoFormulario } from './pages/configuracoes/ServicoContratoFormulario';
import { EscoposServico } from './pages/configuracoes/EscoposServico';
import { EscopoServicoFormulario } from './pages/configuracoes/EscopoServicoFormulario';
import { Atendimento } from './pages/configuracoes/Atendimento';
import { Tipos } from './pages/configuracoes/Tipos';
import { TipoFormulario } from './pages/configuracoes/TipoFormulario';

// Links antigos de "nova manutenção" (inclusive com o equipamento escolhido) abrem o formulário de solicitação já no tipo Manutenção
function NovaManutencaoRedireciona() {
  const { search } = useLocation();
  const equipamento = new URLSearchParams(search).get('equipamento');
  return <Navigate to={`/solicitacoes/nova?tipo=MANUTENCAO${equipamento ? `&equipamento=${encodeURIComponent(equipamento)}` : ''}`} replace />;
}

function Restrita({ children }: { children: ReactNode }) {
  return <RotaRestrita perfis={['OPERADOR']}>{children}</RotaRestrita>;
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
          {/* A manutenção virou um tipo de solicitação: a lista e o formulário são os de Solicitações */}
          <Route path="/manutencoes" element={<Navigate to="/solicitacoes?tipo=MANUTENCAO" replace />} />
          <Route path="/manutencoes/nova" element={<NovaManutencaoRedireciona />} />
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
          <Route path="/configuracoes/itens" element={<Navigate to="/configuracoes/itens/categorias" replace />} />
          <Route path="/configuracoes/servicos" element={<Navigate to="/configuracoes/servicos/prestadores" replace />} />
          <Route path="/configuracoes/itens/categorias" element={<Restrita><Categorias /></Restrita>} />
          <Route path="/configuracoes/itens/categorias/nova" element={<Restrita><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/itens/categorias/:id" element={<Restrita><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores" element={<Restrita><Prestadores /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores/novo" element={<Restrita><PrestadorFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores/:id" element={<Restrita><PrestadorFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos" element={<Restrita><ServicosContrato /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos/novo" element={<Restrita><ServicoContratoFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos/:id" element={<Restrita><ServicoContratoFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/escopos" element={<Restrita><EscoposServico /></Restrita>} />
          <Route path="/configuracoes/servicos/escopos/novo" element={<Restrita><EscopoServicoFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/escopos/:id" element={<Restrita><EscopoServicoFormulario /></Restrita>} />
          <Route path="/configuracoes/atendimento" element={<Restrita><Atendimento /></Restrita>} />
          <Route path="/configuracoes/itens/tipos" element={<Restrita><Tipos /></Restrita>} />
          <Route path="/configuracoes/itens/tipos/novo" element={<Restrita><TipoFormulario /></Restrita>} />
          <Route path="/configuracoes/itens/tipos/:id" element={<Restrita><TipoFormulario /></Restrita>} />
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
    <AuthProvider>
      <BrowserRouter>
        <BarraCarregamento />
        <RotasProtegidas />
      </BrowserRouter>
    </AuthProvider>
  );
}
