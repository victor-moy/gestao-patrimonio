export type OpcaoRelatorio = 'visao-geral' | 'manutencoes' | 'emprestimos' | 'cessoes' | 'ampliacao';

// Cada relatório é um submenu de "Relatórios" na navegação lateral (rota própria).
export const SUBMENUS_RELATORIOS: Array<{ valor: OpcaoRelatorio; rotulo: string }> = [
  {
    valor: 'visao-geral',
    rotulo: 'Visão geral',
  },
  {
    valor: 'ampliacao',
    rotulo: 'Ampliação',
  },
  {
    valor: 'emprestimos',
    rotulo: 'Empréstimos',
  },
  {
    valor: 'cessoes',
    rotulo: 'Cessões de uso',
  },
  {
    valor: 'manutencoes',
    rotulo: 'Manutenções',
  },
];

export const RELATORIO_PADRAO: OpcaoRelatorio = 'visao-geral';

export const caminhoRelatorio = (valor: OpcaoRelatorio) => `/relatorios/${valor}`;

export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}
