-- Responsável da unidade passa a referenciar um usuário do sistema
ALTER TABLE "unidade" ADD COLUMN "responsavel_id" TEXT;

-- Backfill: casa o nome livre antigo com o nome de um usuário existente
UPDATE "unidade" u
SET "responsavel_id" = (
  SELECT us.id FROM "usuario" us WHERE us.nome = u.responsavel LIMIT 1
)
WHERE u.responsavel IS NOT NULL;

ALTER TABLE "unidade" DROP COLUMN "responsavel";

ALTER TABLE "unidade" ADD CONSTRAINT "unidade_responsavel_id_fkey"
  FOREIGN KEY ("responsavel_id") REFERENCES "usuario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
