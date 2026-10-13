-- O tipo de manutenção fixo (enum) dos itens de contrato vira o cadastro "Escopo" (Configurações › Serviços).
-- Os três valores antigos viram escopos iniciais e os itens existentes são religados a eles.

CREATE TABLE "escopo_servico" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escopo_servico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "escopo_servico_nome_key" ON "escopo_servico"("nome");

INSERT INTO "escopo_servico" ("id", "nome") VALUES
    (gen_random_uuid()::text, 'Preventiva'),
    (gen_random_uuid()::text, 'Corretiva'),
    (gen_random_uuid()::text, 'Preventiva e corretiva');

ALTER TABLE "contrato_item" ADD COLUMN "escopo_id" TEXT;
UPDATE "contrato_item" ci SET "escopo_id" = e."id"
FROM "escopo_servico" e
WHERE e."nome" = CASE ci."tipo_manutencao"::text
    WHEN 'PREVENTIVA' THEN 'Preventiva'
    WHEN 'CORRETIVA' THEN 'Corretiva'
    ELSE 'Preventiva e corretiva'
END;
ALTER TABLE "contrato_item" ALTER COLUMN "escopo_id" SET NOT NULL;
ALTER TABLE "contrato_item" DROP COLUMN "tipo_manutencao";
DROP TYPE "TipoManutencaoContrato";

CREATE INDEX "contrato_item_escopo_id_idx" ON "contrato_item"("escopo_id");
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_escopo_id_fkey"
    FOREIGN KEY ("escopo_id") REFERENCES "escopo_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
