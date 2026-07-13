import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Alerta, DashboardData } from '../types';
import { formatarMoedaCompacta } from '../utils/format';

const CORES_PIZZA = ['#0e4e6e', '#1d6fa3', '#3b93c5', '#7bb8dc', '#aed3ea', '#d3e7f4'];

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

function formatarMes(mes: string) {
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(m) - 1]}/${ano.slice(2)}`;
}

export function Inicio() {
  const { usuario } = useAuth();
  const location = useLocation();
  const ehGestor = usuario?.perfil === 'GESTOR_PATRIMONIO' || usuario?.perfil === 'GESTOR_MANUTENCAO';
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ehGestor) return;
    api.get<DashboardData>('/dashboard').then(setDados).catch((e) => setErro(e.message));
    api.get<Alerta[]>('/dashboard/alertas').then(setAlertas).catch(() => {});
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
      </>
    );
  }

  const pizza = dados
    ? (() => {
        const top = dados.equipamentosPorUnidade.slice(0, 5);
        const outros = dados.equipamentosPorUnidade.slice(5).reduce((s, u) => s + u.quantidade, 0);
        return [...top.map((u) => ({ name: u.unidade, value: u.quantidade })), ...(outros > 0 ? [{ name: 'Outros', value: outros }] : [])];
      })()
    : [];

  const maxRanking = Math.max(1, ...(dados?.rankingSolicitacoes.map((r) => r.quantidade) ?? [1]));

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Painel Gerencial</h2>
          <p className="subtitle">Visão consolidada do patrimônio da rede municipal de saúde</p>
        </div>
      </div>

      {erro && <div className="error-banner">{erro}</div>}

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--blue-bg)' }}>📦</div>
          </div>
          <div className="stat-label">Total de Equipamentos</div>
          <div className="stat-value">{dados?.totalEquipamentos ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--yellow-bg)' }}>🔧</div>
            <span className="badge badge-yellow">{dados?.emManutencao ?? 0} ativas</span>
          </div>
          <div className="stat-label">Em Manutenção</div>
          <div className="stat-value">{dados?.emManutencao ?? '—'}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--purple-bg)' }}>🕐</div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Média 6 meses</span>
          </div>
          <div className="stat-label">Tempo Médio Manutenção</div>
          <div className="stat-value">
            {dados?.tempoMedioManutencaoDias ?? '—'} <small>dias</small>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-top">
            <div className="stat-icon" style={{ background: 'var(--green-bg)' }}>💲</div>
          </div>
          <div className="stat-label">Custo Mensal Manutenção</div>
          <div className="stat-value">{dados ? formatarMoedaCompacta(dados.custoMesAtual) : '—'}</div>
        </div>
      </div>

      <div className="grid-2">
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

      <div className="grid-2-even">
        <div className="card card-pad">
          <h3>Equipamentos por Unidade</h3>
          {pizza.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pizza} dataKey="value" nameKey="name" label={(e) => `${e.name}: ${e.value}`}>
                  {pizza.map((_, i) => (
                    <Cell key={i} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sem dados</div>
          )}
        </div>
        <div className="card card-pad">
          <h3>Custo Semestral de Manutenção</h3>
          {dados ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dados.custoSemestral.map((c) => ({ ...c, mes: formatarMes(c.mes) }))}>
                <XAxis dataKey="mes" fontSize={13} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatarMoedaCompacta(Number(v))} />
                <Bar dataKey="custo" fill="#0e4e6e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Sem dados</div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h3>Ranking - Unidades que Mais Solicitam</h3>
        {dados?.rankingSolicitacoes.length === 0 && (
          <div className="empty-state">Sem solicitações registradas</div>
        )}
        {dados?.rankingSolicitacoes.map((r, i) => (
          <div key={r.unidadeId} className="ranking-row">
            <div className="ranking-pos">{i + 1}</div>
            <div className="ranking-body">
              <div className="ranking-name">{r.unidade}</div>
              <div className="ranking-bar">
                <div
                  className="ranking-bar-fill"
                  style={{ width: `${(r.quantidade / maxRanking) * 100}%` }}
                />
              </div>
            </div>
            <div className="ranking-count">
              <div className="n">{r.quantidade}</div>
              <div className="l">solicitações</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
