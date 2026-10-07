import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Alerta, DashboardData } from '../types';
import './Inicio.css';

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

export function Inicio() {
  const { usuario } = useAuth();
  const location = useLocation();
  const ehGestor = usuario?.perfil === 'GESTOR_PATRIMONIO' || usuario?.perfil === 'GESTOR_MANUTENCAO';
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  useEffect(() => {
    if (!ehGestor) return;
    api.get<DashboardData>('/dashboard').then(setDados).catch(() => {});
    api.get<Alerta[]>('/dashboard/alertas').then(setAlertas).catch(() => {});
  }, [ehGestor]);

  const acoes = ACOES_RAPIDAS.filter((a) => a.perfis.includes(usuario?.perfil ?? ''));

  if (!ehGestor) {
    return (
      <section className="gestao-page inicio-page" aria-labelledby="inicio-titulo">
        <div className="page-header">
          <div>
            <h2 id="inicio-titulo">Bem-vindo, {usuario?.nome}</h2>
            <p className="subtitle">
              {usuario?.unidadeNome ? `Unidade: ${usuario.unidadeNome}` : 'Acesso ao sistema de patrimônio'}
            </p>
          </div>
        </div>
        <div className="card card-pad inicio-acoes-unidade">
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
      </section>
    );
  }

  const totalSolicitacoes = dados?.rankingSolicitacoes.reduce((total, item) => total + item.quantidade, 0) ?? 0;
  const unidadesAtendidas = dados?.equipamentosPorUnidade.length ?? 0;

  return (
    <section className="gestao-page inicio-page" aria-labelledby="inicio-titulo">
      <div className="page-header">
        <div>
          <h2 id="inicio-titulo">Bem-vindo, {usuario?.nome}</h2>
        </div>
      </div>

      <div className="gestao-resumo-label">Resumo da operação</div>
      <div className="stats-grid inicio-resumo">
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}>📦</div>
          </div>
          <div className="stat-label">Total de Equipamentos</div>
          <div className="stat-value">{dados?.totalEquipamentos ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--green-bg)' }}>🏥</div>
          </div>
          <div className="stat-label">Unidades atendidas</div>
          <div className="stat-value">{dados ? unidadesAtendidas : '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}>↔</div>
          </div>
          <div className="stat-label">Solicitações registradas</div>
          <div className="stat-value">{dados ? totalSolicitacoes : '—'}</div>
        </div>
      </div>

      <div className="grid-2 inicio-primeira-linha">
        <div className="card card-pad">
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
      </div>

    </section>
  );
}
