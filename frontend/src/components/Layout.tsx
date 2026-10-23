import { Fragment, useEffect, useRef, useState } from 'react';
import './Gestao.css';
import './Polaris.css';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useConversas, useNaoLidas } from '../hooks/useConversas';
import { caminhoConversa, codigoConversa, tituloConversa } from '../utils/conversas';
import { caminhoRelatorio, SUBMENUS_RELATORIOS } from '../utils/relatorios';
import { ContagemNaoLidas } from './ContagemNaoLidas';
import { LogoSistema } from './LogoSistema';
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
  IconeMenu,
  IconeRelatorios,
  IconeUnidades,
  IconeUsuarios,
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
  { para: '/', rotulo: 'Início', icone: <IconeInicio />, perfis: ['OPERADOR', 'UNIDADE', 'GALPAO', 'TERCEIRIZADA', 'SEM_ACESSO'] },
  { para: '/inventario', rotulo: 'Inventário', icone: <IconeInventario />, perfis: ['OPERADOR', 'UNIDADE', 'GALPAO'] },
  { para: '/solicitacoes', rotulo: 'Solicitações', icone: <IconeSolicitacoes />, perfis: ['OPERADOR', 'UNIDADE', 'GALPAO', 'TERCEIRIZADA'] },
  { para: '/estoque', rotulo: 'Estoque', icone: <IconeEstoque />, perfis: ['OPERADOR', 'GALPAO'] },
  { para: '/atas', rotulo: 'Atas', icone: <IconeAtas />, perfis: ['OPERADOR'] },
  { para: '/contratos', rotulo: 'Contratos', icone: <IconeContratos />, perfis: ['OPERADOR', 'TERCEIRIZADA'] },
  {
    para: '/relatorios',
    rotulo: 'Relatórios',
    icone: <IconeRelatorios />,
    perfis: ['OPERADOR'],
    sub: SUBMENUS_RELATORIOS.map((item) => ({ para: caminhoRelatorio(item.valor), rotulo: item.rotulo })),
  },
];

// Navegação própria da página de Configurações; grupos abrem seus submenus enquanto a seção está ativa
interface SecaoConfiguracoes {
  para: string;
  rotulo: string;
  icone: ReactNode;
  prefixo?: string;
  sub?: Array<{ para: string; rotulo: string }>;
}

const SECOES_CONFIGURACOES: SecaoConfiguracoes[] = [
  { para: '/configuracoes/usuarios', rotulo: 'Usuários', icone: <IconeUsuarios /> },
  { para: '/configuracoes/unidades', rotulo: 'Unidades', icone: <IconeUnidades /> },
  {
    para: '/configuracoes/itens',
    prefixo: '/configuracoes/itens',
    rotulo: 'Itens',
    icone: <IconeInventario />,
    sub: [
      { para: '/configuracoes/itens/categorias', rotulo: 'Categorias' },
      { para: '/configuracoes/itens/tipos', rotulo: 'Tipos' },
    ],
  },
  {
    para: '/configuracoes/servicos',
    prefixo: '/configuracoes/servicos',
    rotulo: 'Serviços',
    icone: <IconeContratos />,
    sub: [
      { para: '/configuracoes/servicos/prestadores', rotulo: 'Prestadores' },
      { para: '/configuracoes/servicos/tipos', rotulo: 'Tipos' },
      { para: '/configuracoes/servicos/escopos', rotulo: 'Escopos' },
    ],
  },
  { para: '/configuracoes/atendimento', rotulo: 'Atendimento', icone: <IconeConversas /> },
];

export function Layout() {
  const { usuario, sair: encerrarSessao } = useAuth();
  const donoMenuUsuario = useRef<HTMLDivElement>(null);
  const botaoMenuUsuario = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [saindo, setSaindo] = useState(false);

  if (!usuario) return null;

  const tabs = TABS.filter((t) => t.perfis.includes(usuario.perfil));
  const emConfiguracoes = location.pathname.startsWith('/configuracoes');
  const emConversas = location.pathname.startsWith('/conversas');
  const { conversas } = useConversas(emConversas);
  const naoLidas = useNaoLidas();

  const tituloGestao =
    location.pathname === '/'
      ? 'Início'
      : location.pathname.startsWith('/inventario')
      ? 'Inventário'
      : location.pathname.startsWith('/solicitacoes') || location.pathname.startsWith('/manutencoes')
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
        : null;

  const fecharSidebar = () => setSidebarAberta(false);

  // Mensagens não lidas no título da aba, para quem está em outra janela
  useEffect(() => {
    document.title = naoLidas > 0 ? `(${naoLidas > 99 ? '99+' : naoLidas}) Gestão Patrimonial` : 'Gestão Patrimonial';
    return () => {
      document.title = 'Gestão Patrimonial';
    };
  }, [naoLidas]);

  // O menu do usuário fecha ao clicar fora ou com Escape (devolvendo o foco ao botão); não fecha ao passar o mouse
  useEffect(() => {
    if (!menuAberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!donoMenuUsuario.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAberto(false);
        botaoMenuUsuario.current?.focus();
      }
    };
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [menuAberto]);

  useEffect(() => {
    if (!sidebarAberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarAberta(false);
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [sidebarAberta]);

  // Sair com um fade-out do app antes de voltar ao login, em vez de trocar a tela de uma vez
  function sair() {
    if (saindo) return;
    setMenuAberto(false);
    setSaindo(true);
    const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(encerrarSessao, semMovimento ? 0 : 350);
  }

  return (
    <div className={`app-shell${tituloGestao ? ' app-shell--gestao' : ''}${saindo ? ' app-shell--saindo' : ''}`}>
      {sidebarAberta && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" tabIndex={-1} onClick={fecharSidebar} />}
      <aside className={`sidebar${sidebarAberta ? ' aberta' : ''}`}>
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
              className={({ isActive }) =>
                `sidebar-link sidebar-conversa${isActive ? ' active' : ''}${c.naoLidas > 0 ? ' sidebar-conversa--nao-lida' : ''}`
              }
            >
              <span>{codigoConversa(c)}</span>
              {c.naoLidas > 0 && <ContagemNaoLidas total={c.naoLidas} />}
            </NavLink>
          ))}
        </nav>
        ) : emConfiguracoes ? (
        <nav className="sidebar-nav" aria-label="Navegação de configurações">
          {SECOES_CONFIGURACOES.map((item) => (
            <Fragment key={item.para}>
              <NavLink
                to={item.sub ? item.sub[0].para : item.para}
                // Grupos com submenu não ficam marcados: quem fica ativo é o submenu
                className={({ isActive }) => `sidebar-link${isActive && !item.sub ? ' active' : ''}`}
                onClick={fecharSidebar}
              >
                {item.icone} {item.rotulo}
              </NavLink>
              {item.sub && item.prefixo && location.pathname.startsWith(item.prefixo) && (
                <div className="sidebar-submenu" role="group" aria-label={`Submenus de ${item.rotulo}`}>
                  {item.sub.map((sub) => (
                    <NavLink
                      key={sub.para}
                      to={sub.para}
                      onClick={fecharSidebar}
                      className={({ isActive }) => `sidebar-sublink${isActive ? ' active' : ''}`}
                    >
                      {sub.rotulo}
                    </NavLink>
                  ))}
                </div>
              )}
            </Fragment>
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
                // A manutenção é um tipo de solicitação: seu detalhe (/manutencoes/:id) mantém "Solicitações" marcado
                className={({ isActive }) =>
                  `sidebar-link${isActive || (tab.para === '/solicitacoes' && location.pathname.startsWith('/manutencoes')) ? ' active' : ''}`
                }
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
        {!emConfiguracoes && usuario.perfil !== 'SEM_ACESSO' && (
          <div className="sidebar-footer">
            <NavLink
              to="/conversas"
              onClick={fecharSidebar}
              className={({ isActive }) => `sidebar-link sidebar-conversas${isActive ? ' active' : ''}`}
            >
              <IconeConversas /> Conversas
              {naoLidas > 0 && <ContagemNaoLidas total={naoLidas} />}
            </NavLink>
            {usuario.perfil === 'OPERADOR' && (
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
            aria-label={naoLidas > 0 ? `Abrir menu (${naoLidas} mensagens não lidas)` : 'Abrir menu'}
            aria-expanded={sidebarAberta}
          >
            <IconeMenu />
          </button>
          <Link to="/" className="app-topbar-wordmark" aria-label="Gestão Patrimonial — ir para o Início">
            <LogoSistema />
            <strong>Gestão Patrimonial</strong>
          </Link>
          <div className="topbar-actions">
            <div className="topbar-user" ref={donoMenuUsuario}>
              <button
                type="button"
                className="user-button"
                ref={botaoMenuUsuario}
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
                <div className="user-menu">
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
