import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Alerta } from '../types';

const ACOES_RAPIDAS = [
  {
    para: '/inventario',
    icone: '📦',
    titulo: 'Consultar Inventário',
    sub: 'Visualizar equipamentos por unidade',
    perfis: ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO'],
  },
  {
    para: '/manutencoes',
    icone: '🔧',
    titulo: 'Aprovar Manutenções',
    sub: 'Gerenciar solicitações pendentes',
    perfis: ['GESTOR_MANUTENCAO'],
  },
  {
    para: '/manutencoes',
    icone: '🔧',
    titulo: 'Solicitar Manutenção',
    sub: 'Abrir solicitação para um equipamento',
    perfis: ['UNIDADE'],
  },
  {
    para: '/solicitacoes',
    icone: '📈',
    titulo: 'Cessões e Empréstimos',
    sub: 'Transferências entre unidades',
    perfis: ['GESTOR_PATRIMONIO', 'UNIDADE'],
  },
  {
    para: '/configuracoes?secao=atas',
    icone: '📋',
    titulo: 'Controle de Atas',
    sub: 'Gestão de registro de preços',
    perfis: ['GESTOR_PATRIMONIO'],
  },
  {
    para: '/estoque',
    icone: '🗃️',
    titulo: 'Gestão de Estoque',
    sub: 'Entradas e saídas do galpão',
    perfis: ['GALPAO', 'GESTOR_PATRIMONIO'],
  },
  {
    para: '/solicitacoes',
    icone: '⇆',
    titulo: 'Minhas Solicitações',
    sub: 'Acompanhar status dos pedidos',
    perfis: ['UNIDADE', 'GALPAO'],
  },
];

function AcoesRapidas({ acoes, location }: { acoes: typeof ACOES_RAPIDAS; location: ReturnType<typeof useLocation> }) {
  return (
    <div className="card card-pad">
      <h3>Ações Rápidas</h3>
      <div className="quick-actions">
        {acoes.map((a) => (
          <Link
            key={a.titulo}
            to={a.para}
            state={a.para.startsWith('/configuracoes') ? { background: location } : undefined}
            className="quick-action"
          >
            <span style={{ fontSize: 22 }} aria-hidden>
              {a.icone}
            </span>
            <div className="qa-title">{a.titulo}</div>
            <div className="qa-sub">{a.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Inicio() {
  const { usuario } = useAuth();
  const location = useLocation();
  const ehGestor = usuario?.perfil === 'GESTOR_PATRIMONIO' || usuario?.perfil === 'GESTOR_MANUTENCAO';
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ehGestor) return;
    api.get<Alerta[]>('/dashboard/alertas').then(setAlertas).catch((e) => setErro(e.message));
  }, [ehGestor]);

  const acoes = ACOES_RAPIDAS.filter((a) => a.perfis.includes(usuario?.perfil ?? ''));

  if (!ehGestor) {
    return (
      <>
        <div className="page-header">
          <div>
            <h2>Bem-vindo, {usuario?.nome}</h2>
            <p className="subtitle">
              {usuario?.unidadeNome ? `Unidade: ${usuario.unidadeNome}` : 'Acesso ao sistema de patrimônio'}
            </p>
          </div>
        </div>
        <AcoesRapidas acoes={acoes} location={location} />
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Painel Gerencial</h2>
          <p className="subtitle">Alertas e atalhos para a gestão do patrimônio</p>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <AcoesRapidas acoes={acoes} location={location} />

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>⚠️ Alertas Importantes</h3>
        {alertas.length === 0 && <div className="empty-state">Nenhum alerta no momento</div>}
        {alertas.map((a, i) => (
          <div
            key={i}
            className={`alert-item ${a.severidade === 'CRITICO' ? 'alert-critico' : 'alert-aviso'}`}
          >
            • {a.mensagem}
          </div>
        ))}
      </div>
    </>
  );
}
