import { Fragment, useState } from 'react';
import './Gestao.css';
import './Polaris.css';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useConversas } from '../hooks/useConversas';
import { caminhoConversa, tituloConversa } from '../utils/conversas';
import { caminhoRelatorio, SUBMENUS_RELATORIOS } from '../utils/relatorios';
import {
  IconeChevron,
  IconeAtas,
  IconeConfiguracoes,
  IconeConversas,
  IconeContratos,
  IconeEstoque,
  IconeFechar,
  IconeInicio,
  IconeInventario,
  IconeLogout,
  IconeManutencoes,
  IconeMenu,
  IconeRelatorios,
  IconeUnidades,
  IconeUsuarios,
  IconeCategorias,
  IconeSolicitacoes,
} from './icons';

interface TabDef {
  para: string;
  rotulo: string;
  icone: ReactNode;
  perfis: string[];
  // Submenus exibidos sob o item enquanto a seção está aberta
  sub?: Array<{ para: string; rotulo: string }>;
}

// Abas conforme o header do frame "Gestor" do Figma (6 abas; Atas é
// acessada pelo card "Controle de Atas" do painel e pelo menu do usuário)
const TABS: TabDef[] = [
  { para: '/', rotulo: 'Início', icone: <IconeInicio />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO'] },
  { para: '/inventario', rotulo: 'Inventário', icone: <IconeInventario />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO'] },
  { para: '/manutencoes', rotulo: 'Manutenções', icone: <IconeManutencoes />, perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE'] },
  { para: '/solicitacoes', rotulo: 'Solicitações', icone: <IconeSolicitacoes />, perfis: ['GESTOR_PATRIMONIO', 'UNIDADE', 'GALPAO'] },
  { para: '/estoque', rotulo: 'Estoque', icone: <IconeEstoque />, perfis: ['GESTOR_PATRIMONIO', 'GALPAO'] },
  { para: '/atas', rotulo: 'Atas', icone: <IconeAtas />, perfis: ['GESTOR_PATRIMONIO'] },
  { para: '/contratos', rotulo: 'Contratos', icone: <IconeContratos />, perfis: ['GESTOR_MANUTENCAO', 'GESTOR_PATRIMONIO'] },
  {
    para: '/relatorios',
    rotulo: 'Relatórios',
    icone: <IconeRelatorios />,
    perfis: ['GESTOR_PATRIMONIO'],
    sub: SUBMENUS_RELATORIOS.map((item) => ({ para: caminhoRelatorio(item.valor), rotulo: item.rotulo })),
  },
];

// Navegação própria da página de Configurações
const SECOES_CONFIGURACOES = [
  { para: '/configuracoes/usuarios', rotulo: 'Usuários', icone: <IconeUsuarios /> },
  { para: '/configuracoes/unidades', rotulo: 'Unidades', icone: <IconeUnidades /> },
  { para: '/configuracoes/categorias', rotulo: 'Categorias de itens', icone: <IconeCategorias /> },
  { para: '/configuracoes/tipos', rotulo: 'Tipos de itens', icone: <IconeInventario /> },
  { para: '/configuracoes/atendimento', rotulo: 'Atendimento', icone: <IconeConversas /> },
];

export function Layout() {
  const { usuario, logout, impersonando, voltarAoMestre } = useAuth();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [saindo, setSaindo] = useState(false);

  if (!usuario) return null;

  const tabs = TABS.filter((t) => t.perfis.includes(usuario.perfil));
  const emConfiguracoes = location.pathname.startsWith('/configuracoes');
  const emConversas = location.pathname.startsWith('/conversas');
  const { conversas } = useConversas(emConversas);

  const tituloGestao =
    location.pathname === '/'
      ? 'Início'
      : location.pathname.startsWith('/inventario')
      ? 'Inventário'
      : location.pathname.startsWith('/solicitacoes')
        ? 'Solicitações'
        : location.pathname.startsWith('/estoque')
          ? 'Estoque'
        : location.pathname.startsWith('/atas')
          ? 'Atas'
        : location.pathname.startsWith('/contratos')
          ? 'Contratos'
        : location.pathname.startsWith('/relatorios')
          ? 'Relatórios'
        : location.pathname.startsWith('/configuracoes')
          ? 'Configurações'
        : location.pathname.startsWith('/conversas')
          ? 'Conversas'
        : location.pathname.startsWith('/manutencoes')
          ? 'Manutenções'
        : null;

  const fecharSidebar = () => setSidebarAberta(false);

  // Sair com um fade-out do app antes de voltar ao login, em vez de trocar a tela de uma vez
  function sair() {
    if (saindo) return;
    setMenuAberto(false);
    setSaindo(true);
    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(logout, semMovimento ? 0 : 350);
  }

  return (
    <div className={`app-shell${impersonando ? ' app-shell--impersonando' : ''}${tituloGestao ? ' app-shell--gestao' : ''}${saindo ? ' app-shell--saindo' : ''}`}>
      {sidebarAberta && <div className="sidebar-backdrop" onClick={fecharSidebar} />}
      <aside className={`sidebar${sidebarAberta ? ' aberta' : ''}`}>
        <button className="sidebar-fechar" type="button" onClick={fecharSidebar} aria-label="Fechar menu"><IconeFechar /></button>
        {emConversas ? (
        <nav className="sidebar-nav" aria-label="Conversas">
          {conversas === null && <span className="sidebar-vazio" role="status">Carregando…</span>}
          {conversas?.length === 0 && <span className="sidebar-vazio" role="status">Nenhuma conversa ainda</span>}
          {conversas?.map((c) => (
            <NavLink
              key={`${c.contexto}-${c.id}`}
              to={caminhoConversa(c.contexto, c.id)}
              onClick={fecharSidebar}
              title={tituloConversa(c)}
              className={({ isActive }) => `sidebar-link sidebar-conversa${isActive ? ' active' : ''}`}
            >
              <span>{tituloConversa(c)}</span>
            </NavLink>
          ))}
        </nav>
        ) : emConfiguracoes ? (
        <nav className="sidebar-nav" aria-label="Navegação de configurações">
          {SECOES_CONFIGURACOES.map((item) => (
            <NavLink
              key={item.para}
              to={item.para}
              onClick={fecharSidebar}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {item.icone} {item.rotulo}
            </NavLink>
          ))}
        </nav>
        ) : (
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {tabs.map((tab) => (
            <Fragment key={tab.para}>
              <NavLink
                to={tab.para}
                // Itens com submenu não ficam marcados: quem fica ativo é o submenu
                end={tab.para === '/' || Boolean(tab.sub)}
                onClick={fecharSidebar}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                {tab.icone} {tab.rotulo}
              </NavLink>
              {tab.sub && location.pathname.startsWith(tab.para) && (
                <div className="sidebar-submenu" role="group" aria-label={`Submenus de ${tab.rotulo}`}>
                  {tab.sub.map((item) => (
                    <NavLink
                      key={item.para}
                      to={item.para}
                      onClick={fecharSidebar}
                      className={({ isActive }) => `sidebar-sublink${isActive ? ' active' : ''}`}
                    >
                      {item.rotulo}
                    </NavLink>
                  ))}
                </div>
              )}
            </Fragment>
          ))}
        </nav>
        )}
        {!emConfiguracoes && (
          <div className="sidebar-footer">
            <NavLink
              to="/conversas"
              onClick={fecharSidebar}
              className={({ isActive }) => `sidebar-link sidebar-conversas${isActive ? ' active' : ''}`}
            >
              <IconeConversas /> Conversas
            </NavLink>
            {usuario.perfil === 'GESTOR_PATRIMONIO' && (
              <NavLink to="/configuracoes" onClick={fecharSidebar} className="sidebar-link sidebar-configuracoes">
                <IconeConfiguracoes /> Configurações
              </NavLink>
            )}
          </div>
        )}
      </aside>
      <div className={`app-content${emConversas ? ' app-content--branco' : ''}`}>
        <header className="app-topbar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarAberta(true)}
            aria-label="Abrir menu"
            aria-expanded={sidebarAberta}
          >
            <IconeMenu />
          </button>
          <Link to="/" className="app-topbar-wordmark" aria-label="Gestão Patrimonial — ir para o Início">
            <strong>Gestão Patrimonial</strong>
          </Link>
          <div className="topbar-actions">
            <div className="topbar-user">
              <button
                type="button"
                className="user-button"
                onClick={() => setMenuAberto((v) => !v)}
                aria-label="Menu do usuário"
                aria-expanded={menuAberto}
              >
                <span className="avatar">{usuario.nome.charAt(0).toUpperCase()}</span>
                <div className="user-meta">
                  <div className="email">{usuario.nome}</div>
                </div>
                <span className="chevron">
                  <IconeChevron />
                </span>
              </button>
              {menuAberto && (
                <div className="user-menu" onMouseLeave={() => setMenuAberto(false)}>
                  {impersonando && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuAberto(false);
                        voltarAoMestre();
                      }}
                    >
                      <IconeUsuarios /> Redefinir usuário
                    </button>
                  )}
                  <button type="button" onClick={sair}><IconeLogout /> Sair</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className={`page${emConfiguracoes || emConversas ? ' page--secao' : ''}`}>
          {(emConfiguracoes || emConversas) && (
            <Link to="/" className="fechar-secao" aria-label={emConversas ? 'Fechar conversas' : 'Fechar configurações'}>
              <IconeFechar />
            </Link>
          )}
          {/* A chave remonta o conteúdo a cada rota para reiniciar a animação de entrada */}
          <div key={location.pathname} className="pagina-transicao">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
