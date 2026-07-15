import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import logoPrefeitura from '../assets/logo-prefeitura-saude.png';
import {
  IconeChevron,
  IconeEstoque,
  IconeFechar,
  IconeInicio,
  IconeInventario,
  IconeManutencoes,
  IconeMenu,
  IconeRelatorios,
  IconeSolicitacoes,
} from './icons';

interface TabDef {
  para: string;
  rotulo: string;
  icone: ReactNode;
  perfis: string[];
}

// Abas conforme o header do frame "Gestor" do Figma (6 abas; Atas é
// acessada pelo card "Controle de Atas" do painel e pelo menu do usuário)
const TABS: TabDef[] = [
  { para: '/', rotulo: 'Início', icone: <IconeInicio />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO'] },
  { para: '/inventario', rotulo: 'Inventário', icone: <IconeInventario />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO'] },
  { para: '/manutencoes', rotulo: 'Manutenções', icone: <IconeManutencoes />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE'] },
  { para: '/solicitacoes', rotulo: 'Solicitações', icone: <IconeSolicitacoes />, perfis: ['GESTOR_PATRIMONIO', 'UNIDADE', 'GALPAO'] },
  { para: '/estoque', rotulo: 'Estoque', icone: <IconeEstoque />, perfis: ['GESTOR_PATRIMONIO', 'GALPAO'] },
  { para: '/relatorios', rotulo: 'Relatórios', icone: <IconeRelatorios />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO'] },
];

export function Layout() {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);

  if (!usuario) return null;

  const tabs = TABS.filter((t) => t.perfis.includes(usuario.perfil));

  const fecharSidebar = () => setSidebarAberta(false);

  return (
    <div className="app-shell">
      {sidebarAberta && <div className="sidebar-backdrop" onClick={fecharSidebar} />}
      <aside className={`sidebar${sidebarAberta ? ' aberta' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo-plate">
            <img
              className="sidebar-logo"
              src={logoPrefeitura}
              alt="Prefeitura de Joinville - Secretaria da Saúde"
            />
          </div>
          <button className="sidebar-fechar" onClick={fecharSidebar} aria-label="Fechar menu">
            <IconeFechar />
          </button>
        </div>
        <nav className="sidebar-nav">
          {tabs.map((tab) => (
            <NavLink
              key={tab.para}
              to={tab.para}
              end={tab.para === '/'}
              onClick={fecharSidebar}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {tab.icone} {tab.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="user-button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Menu do usuário"
          >
            <span className="avatar">{usuario.nome.charAt(0).toUpperCase()}</span>
            <div className="user-meta">
              <div className="email">{usuario.nome}</div>
              <div className="role">{usuario.email}</div>
            </div>
            <span className="chevron">
              <IconeChevron />
            </span>
          </button>
          {menuAberto && (
            <div className="user-menu" onMouseLeave={() => setMenuAberto(false)}>
              {usuario.perfil === 'GESTOR_PATRIMONIO' && (
                <NavLink
                  to="/configuracoes"
                  state={{ background: location }}
                  onClick={() => setMenuAberto(false)}
                >
                  Configurações do Sistema
                </NavLink>
              )}
              <button onClick={logout}>Sair</button>
            </div>
          )}
        </div>
      </aside>
      <div className="app-content">
        <header className="app-topbar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarAberta(true)}
            aria-label="Abrir menu"
          >
            <IconeMenu />
          </button>
          <img
            className="app-topbar-logo"
            src={logoPrefeitura}
            alt="Prefeitura de Joinville - Secretaria da Saúde"
          />
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
