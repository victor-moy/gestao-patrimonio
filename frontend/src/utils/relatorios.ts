export type OpcaoRelatorio = 'visao-geral' | 'emprestimos' | 'cessoes' | 'itens-estoque';

// Cada relatório é um submenu de "Relatórios" na navegação lateral (rota própria).
export const SUBMENUS_RELATORIOS: Array<{ valor: OpcaoRelatorio; rotulo: string }> = [
  {
    valor: 'visao-geral',
    rotulo: 'Visão geral',
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
    valor: 'itens-estoque',
    rotulo: 'Itens e estoque',
  },
];

export const RELATORIO_PADRAO: OpcaoRelatorio = 'visao-geral';

export const caminhoRelatorio = (valor: OpcaoRelatorio) => `/relatorios/${valor}`;

export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)));
}
