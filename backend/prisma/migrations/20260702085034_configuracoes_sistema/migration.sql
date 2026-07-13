-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('ATIVO', 'RENOVACAO_PENDENTE', 'EXPIRADO');

-- AlterTable
ALTER TABLE "ata" ADD COLUMN     "fornecedor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "unidade_especifica_id" TEXT;

-- AlterTable
ALTER TABLE "categoria" ADD COLUMN     "cor" TEXT;

-- AlterTable (colunas novas entram como NULL, são preenchidas e só então
-- recebem NOT NULL — a tabela pode ter contratos pré-existentes)
ALTER TABLE "contrato" ADD COLUMN     "condicoes_pagamento" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "status" "StatusContrato" NOT NULL DEFAULT 'ATIVO',
ADD COLUMN     "tipo" TEXT,
ADD COLUMN     "valor_total" DECIMAL(14,2),
ALTER COLUMN "cnpj" DROP NOT NULL;

-- Backfill dos contratos existentes
UPDATE "contrato"
SET "numero" = 'CONT-' || to_char("criado_em", 'YYYY') || '-' || lpad(sub.rn::text, 3, '0'),
    "tipo" = 'Manutenção'
FROM (SELECT id AS rid, row_number() OVER (ORDER BY "criado_em") AS rn FROM "contrato") sub
WHERE "contrato".id = sub.rid AND "contrato"."numero" IS NULL;

ALTER TABLE "contrato" ALTER COLUMN "numero" SET NOT NULL;
ALTER TABLE "contrato" ALTER COLUMN "tipo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "contrato_numero_key" ON "contrato"("numero");

-- AddForeignKey
ALTER TABLE "ata" ADD CONSTRAINT "ata_unidade_especifica_id_fkey" FOREIGN KEY ("unidade_especifica_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
