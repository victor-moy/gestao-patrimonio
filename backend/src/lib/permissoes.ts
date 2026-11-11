// Permissões do Operador. O perfil OPERADOR sozinho não autoriza nada: cada ação exige a permissão correspondente,
// atribuída usuário a usuário (Configurações › Usuários). Os demais perfis não usam permissões.
// Aqui ficam só os identificadores; os grupos e rótulos da tela estão em frontend/src/utils/permissoes.ts (um teste confere que os ids são os mesmos).
export const TODAS_PERMISSOES = [
  'MANUTENCAO_CONSULTAR',
  'MANUTENCAO_ESCREVER',
  'MANUTENCAO_TRIAR',
  'MANUTENCAO_AVALIAR',
  // As três seguintes ainda não têm ação correspondente no sistema: a permissão é guardada e passa a valer quando a função existir
  'MANUTENCAO_VISTORIAR',
  'MANUTENCAO_MEDICAO_PREPARAR',
  'MANUTENCAO_MEDICAO_CONFERIR',
  'MANUTENCAO_FISCALIZAR',
  'CONTRATOS_GERENCIAR',
  'ATAS_GERENCIAR',
  'ESTOQUE_GERENCIAR',
  'RELATORIOS_VISUALIZAR',
  'SOLICITACOES_GERENCIAR',
  'INVENTARIO_GERENCIAR',
  'CONFIGURACOES_GERENCIAR',
  'USUARIOS_ADMINISTRAR',
] as const;
export type Permissao = (typeof TODAS_PERMISSOES)[number];

const CONHECIDAS = new Set<string>(TODAS_PERMISSOES);

// Ignora qualquer valor que não esteja no catálogo (token antigo ou adulterado nunca concede permissão inventada)
export function permissoesValidas(bruto: unknown): Permissao[] {
  if (!Array.isArray(bruto)) return [];
  return [...new Set(bruto.filter((p): p is Permissao => typeof p === 'string' && CONHECIDAS.has(p)))];
}
