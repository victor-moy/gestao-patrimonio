-- Contratos passam a ter itens (equipamento + valor + tipo de manutenção); o valor total é a soma deles.
-- Remove "tipo", "observacoes" e "condicoes_pagamento". Contratos existentes não têm itens e mantêm o
-- valor_total já gravado até que seus itens sejam informados.

CREATE TYPE "TipoManutencaoContrato" AS ENUM ('PREVENTIVA', 'CORRETIVA', 'AMBAS');

CREATE TABLE "contrato_item" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "tipo_manutencao" "TipoManutencaoContrato" NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contrato_item_valor_nao_negativo" CHECK ("valor" >= 0)
);

CREATE INDEX "contrato_item_equipamento_id_idx" ON "contrato_item"("equipamento_id");
CREATE UNIQUE INDEX "contrato_item_contrato_id_equipamento_id_key" ON "contrato_item"("contrato_id", "equipamento_id");

ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_contrato_id_fkey"
    FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_equipamento_id_fkey"
    FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contrato"
    DROP COLUMN "tipo",
    DROP COLUMN "observacoes",
    DROP COLUMN "condicoes_pagamento";
