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
import { pode, type Permissao } from './utils/permissoes';
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
import { ReportarBug } from './pages/ReportarBug';
import { Relatos } from './pages/configuracoes/Relatos';
import { RelatoDetalhe } from './pages/configuracoes/RelatoDetalhe';
import { Atendimento } from './pages/configuracoes/Atendimento';
import { CategoriasCivis } from './pages/configuracoes/CategoriasCivis';
import { CategoriaCivilFormulario } from './pages/configuracoes/CategoriaCivilFormulario';
import { Tipos } from './pages/configuracoes/Tipos';
import { TipoFormulario } from './pages/configuracoes/TipoFormulario';

// Links antigos de "nova manutenção" (inclusive com o equipamento escolhido) abrem o formulário de solicitação já no tipo Manutenção
function NovaManutencaoRedireciona() {
  const { search } = useLocation();
  const equipamento = new URLSearchParams(search).get('equipamento');
  return <Navigate to={`/solicitacoes/nova?tipo=MANUTENCAO${equipamento ? `&equipamento=${encodeURIComponent(equipamento)}` : ''}`} replace />;
}

function Restrita({ children, permissoes }: { children: ReactNode; permissoes: Permissao[] }) {
  return (
    <RotaRestrita perfis={['OPERADOR']} permissoes={permissoes}>
      {children}
    </RotaRestrita>
  );
}

// /configuracoes abre na primeira área que o Operador pode acessar
function ConfiguracoesInicio() {
  const { usuario } = useAuth();
  const destino = pode(usuario, 'USUARIOS_ADMINISTRAR')
    ? 'usuarios'
    : pode(usuario, 'CONFIGURACOES_GERENCIAR')
      ? 'unidades'
      : pode(usuario, 'CONTRATOS_GERENCIAR')
        ? 'servicos/prestadores'
        : null;
  return <Navigate to={destino ? `/configuracoes/${destino}` : '/'} replace />;
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
  // Sem perfil ainda: só a tela inicial; qualquer outro endereço volta a ela
  if (usuario.perfil === 'SEM_ACESSO') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="/reportar-bug" element={<ReportarBug />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
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
          <Route path="/estoque" element={<RotaRestrita perfis={['OPERADOR', 'GALPAO']} permissoes={['ESTOQUE_GERENCIAR']}><Estoque /></RotaRestrita>} />
          <Route path="/estoque/movimentar" element={<RotaRestrita perfis={['OPERADOR', 'GALPAO']} permissoes={['ESTOQUE_GERENCIAR']}><MovimentacaoEstoque /></RotaRestrita>} />
          <Route path="/relatorios" element={<Navigate to="/relatorios/visao-geral" replace />} />
          <Route path="/relatorios/:relatorio" element={<RotaRestrita perfis={['OPERADOR']} permissoes={['RELATORIOS_VISUALIZAR']}><Relatorios /></RotaRestrita>} />
          <Route path="/configuracoes" element={<ConfiguracoesInicio />} />
          <Route path="/configuracoes/usuarios" element={<Restrita permissoes={['USUARIOS_ADMINISTRAR']}><Usuarios /></Restrita>} />
          <Route path="/configuracoes/usuarios/novo" element={<Restrita permissoes={['USUARIOS_ADMINISTRAR']}><UsuarioFormulario /></Restrita>} />
          <Route path="/configuracoes/usuarios/:id" element={<Restrita permissoes={['USUARIOS_ADMINISTRAR']}><UsuarioFormulario /></Restrita>} />
          <Route path="/configuracoes/unidades" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><Unidades /></Restrita>} />
          <Route path="/configuracoes/unidades/nova" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><UnidadeFormulario /></Restrita>} />
          <Route path="/configuracoes/unidades/:id" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><UnidadeFormulario /></Restrita>} />
          <Route path="/configuracoes/itens" element={<Navigate to="/configuracoes/itens/categorias" replace />} />
          <Route path="/configuracoes/chamados" element={<Navigate to="/configuracoes/chamados/tipos-civis" replace />} />
          <Route path="/configuracoes/servicos" element={<Navigate to="/configuracoes/servicos/prestadores" replace />} />
          <Route path="/configuracoes/itens/categorias" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><Categorias /></Restrita>} />
          <Route path="/configuracoes/itens/categorias/nova" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/itens/categorias/:id" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><CategoriaFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><Prestadores /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores/novo" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><PrestadorFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/prestadores/:id" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><PrestadorFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><ServicosContrato /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos/novo" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><ServicoContratoFormulario /></Restrita>} />
          <Route path="/configuracoes/servicos/tipos/:id" element={<Restrita permissoes={['CONTRATOS_GERENCIAR']}><ServicoContratoFormulario /></Restrita>} />
          <Route path="/configuracoes/chamados/tipos-civis" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><CategoriasCivis /></Restrita>} />
          <Route path="/configuracoes/chamados/tipos-civis/nova" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><CategoriaCivilFormulario /></Restrita>} />
          <Route path="/configuracoes/chamados/tipos-civis/:id" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><CategoriaCivilFormulario /></Restrita>} />
          <Route path="/configuracoes/atendimento" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><Atendimento /></Restrita>} />
          <Route path="/configuracoes/itens/tipos" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><Tipos /></Restrita>} />
          <Route path="/configuracoes/itens/tipos/novo" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><TipoFormulario /></Restrita>} />
          <Route path="/configuracoes/itens/tipos/:id" element={<Restrita permissoes={['CONFIGURACOES_GERENCIAR']}><TipoFormulario /></Restrita>} />
          <Route path="/reportar-bug" element={<ReportarBug />} />
          <Route path="/configuracoes/relatos" element={<Restrita permissoes={['USUARIOS_ADMINISTRAR']}><Relatos /></Restrita>} />
          <Route path="/configuracoes/relatos/:id" element={<Restrita permissoes={['USUARIOS_ADMINISTRAR']}><RelatoDetalhe /></Restrita>} />
          <Route path="/conversas" element={<Conversas />} />
          <Route path="/conversas/:contexto/:id" element={<ConversaPagina />} />
          <Route path="/atas" element={<RotaRestrita perfis={['OPERADOR']} permissoes={['ATAS_GERENCIAR']}><Atas /></RotaRestrita>} />
          <Route path="/atas/nova" element={<RotaRestrita perfis={['OPERADOR']} permissoes={['ATAS_GERENCIAR']}><AtaFormulario /></RotaRestrita>} />
          <Route path="/atas/:id" element={<RotaRestrita perfis={['OPERADOR']} permissoes={['ATAS_GERENCIAR']}><AtaFormulario /></RotaRestrita>} />
          <Route path="/contratos" element={<RotaRestrita perfis={['OPERADOR', 'TERCEIRIZADA']} permissoes={['CONTRATOS_GERENCIAR', 'MANUTENCAO_CONSULTAR']}><Contratos /></RotaRestrita>} />
          <Route path="/contratos/novo" element={<RotaRestrita perfis={['OPERADOR', 'TERCEIRIZADA']} permissoes={['CONTRATOS_GERENCIAR', 'MANUTENCAO_CONSULTAR']}><ContratoFormulario /></RotaRestrita>} />
          <Route path="/contratos/:id" element={<RotaRestrita perfis={['OPERADOR', 'TERCEIRIZADA']} permissoes={['CONTRATOS_GERENCIAR', 'MANUTENCAO_CONSULTAR']}><ContratoFormulario /></RotaRestrita>} />
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
