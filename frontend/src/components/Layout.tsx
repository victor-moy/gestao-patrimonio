import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ROTULO_PERFIL } from '../utils/format';
import {
  IconeChevron,
  IconeEstoque,
  IconeInicio,
  IconeInventario,
  IconeManutencoes,
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

  if (!usuario) return null;

  const tabs = TABS.filter((t) => t.perfis.includes(usuario.perfil));

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title">
            <h1>Sistema de Gestão de Patrimônio</h1>
            <p>Secretaria Municipal de Saúde - Joinville</p>
          </div>
          <button
            className="user-button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Menu do usuário"
          >
            <div className="user-meta">
              <div className="email">{usuario.nome}</div>
              <div className="role">{usuario.email}</div>
            </div>
            <span className="avatar">{usuario.nome.charAt(0).toUpperCase()}</span>
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
      </header>
      <nav className="app-nav">
        <div className="tabs">
          {tabs.map((tab) => (
            <NavLink
              key={tab.para}
              to={tab.para}
              end={tab.para === '/'}
              className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
            >
              {tab.icone} {tab.rotulo}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
