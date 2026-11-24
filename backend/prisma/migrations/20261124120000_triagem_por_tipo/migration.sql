-- A permissão de triagem se divide em civil e equipamentos. Quem já triava passa a triar os dois tipos,
-- para ninguém perder o acesso; depois o administrador ajusta usuário a usuário.
UPDATE "usuario"
SET "permissoes" = array_cat(
  array_remove("permissoes", 'MANUTENCAO_TRIAR'),
  ARRAY['MANUTENCAO_TRIAR_CIVIL', 'MANUTENCAO_TRIAR_EQUIPAMENTO']
)
WHERE 'MANUTENCAO_TRIAR' = ANY("permissoes");
