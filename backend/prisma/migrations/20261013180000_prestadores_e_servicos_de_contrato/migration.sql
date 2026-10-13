-- Contratos passam a ter um prestador de serviço (cadastro próprio) e itens que são serviços do catálogo
-- (antes, equipamentos). Fornecedor e CNPJ dos contratos existentes viram prestadores.

CREATE TABLE "prestador_servico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prestador_servico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prestador_servico_nome_key" ON "prestador_servico"("nome");
CREATE UNIQUE INDEX "prestador_servico_cnpj_key" ON "prestador_servico"("cnpj");

CREATE TABLE "servico_contrato" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "servico_contrato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "servico_contrato_nome_key" ON "servico_contrato"("nome");

-- Um prestador por fornecedor já cadastrado (o CNPJ já era único por contrato)
INSERT INTO "prestador_servico" ("id", "nome", "cnpj")
SELECT gen_random_uuid()::text, btrim("empresa"), MAX("cnpj")
FROM "contrato"
GROUP BY btrim("empresa");

ALTER TABLE "contrato" ADD COLUMN "prestador_id" TEXT;
UPDATE "contrato" c SET "prestador_id" = p."id"
FROM "prestador_servico" p
WHERE p."nome" = btrim(c."empresa");
ALTER TABLE "contrato" ALTER COLUMN "prestador_id" SET NOT NULL;
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_prestador_id_fkey"
    FOREIGN KEY ("prestador_id") REFERENCES "prestador_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "contrato_prestador_id_idx" ON "contrato"("prestador_id");
ALTER TABLE "contrato" DROP COLUMN "empresa", DROP COLUMN "cnpj";

-- Itens vinculados a equipamentos não têm serviço correspondente: saem (a funcionalidade ainda não havia
-- sido publicada). O valor_total gravado nos contratos é mantido, como em qualquer contrato sem itens.
DELETE FROM "contrato_item";
DROP INDEX "contrato_item_contrato_id_equipamento_id_key";
DROP INDEX "contrato_item_equipamento_id_idx";
ALTER TABLE "contrato_item" DROP CONSTRAINT "contrato_item_equipamento_id_fkey";
ALTER TABLE "contrato_item" DROP COLUMN "equipamento_id";
ALTER TABLE "contrato_item" ADD COLUMN "servico_id" TEXT NOT NULL;
CREATE INDEX "contrato_item_servico_id_idx" ON "contrato_item"("servico_id");
CREATE UNIQUE INDEX "contrato_item_contrato_id_servico_id_key" ON "contrato_item"("contrato_id", "servico_id");
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_servico_id_fkey"
    FOREIGN KEY ("servico_id") REFERENCES "servico_contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
