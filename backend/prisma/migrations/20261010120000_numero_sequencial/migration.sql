-- Número sequencial legível (SOL-0001 / MAN-0001); os registros existentes são numerados pela ordem de criação

CREATE SEQUENCE "solicitacao_numero_seq";
ALTER TABLE "solicitacao" ADD COLUMN "numero" INTEGER;
WITH ordenadas AS (SELECT "id", row_number() OVER (ORDER BY "criado_em", "id") AS n FROM "solicitacao")
UPDATE "solicitacao" SET "numero" = ordenadas.n FROM ordenadas WHERE "solicitacao"."id" = ordenadas."id";
SELECT setval('"solicitacao_numero_seq"', COALESCE((SELECT MAX("numero") FROM "solicitacao"), 0) + 1, false);
ALTER TABLE "solicitacao" ALTER COLUMN "numero" SET DEFAULT nextval('"solicitacao_numero_seq"');
ALTER TABLE "solicitacao" ALTER COLUMN "numero" SET NOT NULL;
ALTER SEQUENCE "solicitacao_numero_seq" OWNED BY "solicitacao"."numero";
CREATE UNIQUE INDEX "solicitacao_numero_key" ON "solicitacao"("numero");

CREATE SEQUENCE "manutencao_numero_seq";
ALTER TABLE "manutencao" ADD COLUMN "numero" INTEGER;
WITH ordenadas AS (SELECT "id", row_number() OVER (ORDER BY "criado_em", "id") AS n FROM "manutencao")
UPDATE "manutencao" SET "numero" = ordenadas.n FROM ordenadas WHERE "manutencao"."id" = ordenadas."id";
SELECT setval('"manutencao_numero_seq"', COALESCE((SELECT MAX("numero") FROM "manutencao"), 0) + 1, false);
ALTER TABLE "manutencao" ALTER COLUMN "numero" SET DEFAULT nextval('"manutencao_numero_seq"');
ALTER TABLE "manutencao" ALTER COLUMN "numero" SET NOT NULL;
ALTER SEQUENCE "manutencao_numero_seq" OWNED BY "manutencao"."numero";
CREATE UNIQUE INDEX "manutencao_numero_key" ON "manutencao"("numero");
