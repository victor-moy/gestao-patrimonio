-- Permissões do Operador: cada operador passa a ter as próprias permissões (catálogo em src/lib/permissoes.ts).
ALTER TABLE "usuario" ADD COLUMN "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Quem já era Operador (Administrador) mantém o acesso que tinha: recebe todas as permissões.
UPDATE "usuario"
SET "permissoes" = ARRAY[
  'MANUTENCAO_CONSULTAR', 'MANUTENCAO_ESCREVER', 'MANUTENCAO_TRIAR', 'MANUTENCAO_AVALIAR', 'MANUTENCAO_VISTORIAR',
  'MANUTENCAO_MEDICAO_PREPARAR', 'MANUTENCAO_MEDICAO_CONFERIR', 'MANUTENCAO_FISCALIZAR',
  'CONTRATOS_GERENCIAR', 'ATAS_GERENCIAR', 'ESTOQUE_GERENCIAR', 'RELATORIOS_VISUALIZAR',
  'SOLICITACOES_GERENCIAR', 'INVENTARIO_GERENCIAR', 'CONFIGURACOES_GERENCIAR', 'USUARIOS_ADMINISTRAR'
]
WHERE "perfil" = 'OPERADOR';
