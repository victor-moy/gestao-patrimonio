-- Chamados de suporte: o relato de bug vira um chamado com protocolo, categoria, título e conversa.
-- O valor novo do status só é usado em código (não neste arquivo), pois o PostgreSQL não deixa usar um valor de enum
-- recém-criado na mesma transação.
ALTER TYPE "StatusRelato" ADD VALUE 'AGUARDANDO_RETORNO';

CREATE TYPE "CategoriaRelato" AS ENUM ('BUG', 'MELHORIA', 'NOVA_FUNCIONALIDADE', 'DUVIDA', 'OUTRO');

-- Protocolo sequencial: os relatos que já existem recebem o número na ordem em que foram enviados
CREATE SEQUENCE "relato_problema_numero_seq";
ALTER TABLE "relato_problema" ADD COLUMN "numero" INTEGER;
UPDATE "relato_problema" r SET "numero" = s.n
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "criado_em", "id") AS n FROM "relato_problema") s
WHERE r."id" = s."id";
SELECT setval('relato_problema_numero_seq', COALESCE((SELECT MAX("numero") FROM "relato_problema"), 0) + 1, false);
ALTER TABLE "relato_problema"
  ALTER COLUMN "numero" SET DEFAULT nextval('relato_problema_numero_seq'),
  ALTER COLUMN "numero" SET NOT NULL;
ALTER SEQUENCE "relato_problema_numero_seq" OWNED BY "relato_problema"."numero";
CREATE UNIQUE INDEX "relato_problema_numero_key" ON "relato_problema"("numero");

ALTER TABLE "relato_problema"
  ADD COLUMN "categoria" "CategoriaRelato" NOT NULL DEFAULT 'BUG',
  ADD COLUMN "titulo" VARCHAR(80),
  ADD COLUMN "resolvido_em" TIMESTAMP(3);
UPDATE "relato_problema" SET "resolvido_em" = "atualizado_em" WHERE "status" = 'RESOLVIDO';

CREATE TABLE "mensagem_relato" (
    "id" TEXT NOT NULL,
    "relato_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_relato_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mensagem_relato_relato_id_criado_em_idx" ON "mensagem_relato"("relato_id", "criado_em");
ALTER TABLE "mensagem_relato" ADD CONSTRAINT "mensagem_relato_relato_id_fkey" FOREIGN KEY ("relato_id") REFERENCES "relato_problema"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagem_relato" ADD CONSTRAINT "mensagem_relato_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nova permissão "Atender chamados de suporte": quem já administrava usuários (e por isso lia os relatos) a recebe
UPDATE "usuario"
SET "permissoes" = array_append("permissoes", 'SUPORTE_ATENDER')
WHERE 'USUARIOS_ADMINISTRAR' = ANY("permissoes") AND NOT ('SUPORTE_ATENDER' = ANY("permissoes"));
