// Permissões do Operador. O perfil OPERADOR sozinho não autoriza nada: cada ação exige a permissão correspondente,
// atribuída usuário a usuário (Configurações › Usuários). Os demais perfis não usam permissões.
// A lista espelhada no frontend fica em frontend/src/utils/permissoes.ts; mantenha as duas iguais.
export const GRUPOS_PERMISSOES = [
  {
    grupo: 'Manutenções',
    permissoes: [
      { id: 'MANUTENCAO_CONSULTAR', rotulo: 'Consultar chamados' },
      { id: 'MANUTENCAO_ESCREVER', rotulo: 'Escrever chamados' },
      { id: 'MANUTENCAO_TRIAR', rotulo: 'Triar chamados' },
      { id: 'MANUTENCAO_AVALIAR', rotulo: 'Realizar avaliação técnica' },
      // Ainda sem ação correspondente no sistema: a permissão é guardada e passa a valer quando a função existir
      { id: 'MANUTENCAO_VISTORIAR', rotulo: 'Registrar vistorias' },
      { id: 'MANUTENCAO_MEDICAO_PREPARAR', rotulo: 'Preparar medições' },
      { id: 'MANUTENCAO_MEDICAO_CONFERIR', rotulo: 'Conferir medições' },
      { id: 'MANUTENCAO_FISCALIZAR', rotulo: 'Fiscalizar' },
    ],
  },
  { grupo: 'Contratos', permissoes: [{ id: 'CONTRATOS_GERENCIAR', rotulo: 'Gerenciar contratos' }] },
  { grupo: 'Atas', permissoes: [{ id: 'ATAS_GERENCIAR', rotulo: 'Gerenciar atas' }] },
  { grupo: 'Estoque', permissoes: [{ id: 'ESTOQUE_GERENCIAR', rotulo: 'Gerenciar estoque' }] },
  { grupo: 'Relatórios', permissoes: [{ id: 'RELATORIOS_VISUALIZAR', rotulo: 'Visualizar relatórios' }] },
  { grupo: 'Solicitações', permissoes: [{ id: 'SOLICITACOES_GERENCIAR', rotulo: 'Gerenciar solicitações' }] },
  { grupo: 'Inventário', permissoes: [{ id: 'INVENTARIO_GERENCIAR', rotulo: 'Gerenciar inventário' }] },
  { grupo: 'Configurações', permissoes: [{ id: 'CONFIGURACOES_GERENCIAR', rotulo: 'Gerenciar configurações' }] },
  { grupo: 'Usuários', permissoes: [{ id: 'USUARIOS_ADMINISTRAR', rotulo: 'Administrar usuários e permissões' }] },
] as const;

export const TODAS_PERMISSOES = GRUPOS_PERMISSOES.flatMap((g) => g.permissoes.map((p) => p.id));
export type Permissao = (typeof TODAS_PERMISSOES)[number];

const CONHECIDAS = new Set<string>(TODAS_PERMISSOES);

// Ignora qualquer valor que não esteja no catálogo (token antigo ou adulterado nunca concede permissão inventada)
export function permissoesValidas(bruto: unknown): Permissao[] {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter((p): p is Permissao => typeof p === 'string' && CONHECIDAS.has(p)))];
}
