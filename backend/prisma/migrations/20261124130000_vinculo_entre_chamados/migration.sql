-- Chamados relacionados pela triagem (continuam separados). Uma linha por par; a consulta olha os dois sentidos.
CREATE TABLE "manutencao_vinculo" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "relacionada_id" TEXT NOT NULL,
    "criado_por_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manutencao_vinculo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "manutencao_vinculo_diferentes" CHECK ("manutencao_id" <> "relacionada_id")
);

CREATE UNIQUE INDEX "manutencao_vinculo_manutencao_id_relacionada_id_key" ON "manutencao_vinculo"("manutencao_id", "relacionada_id");
CREATE INDEX "manutencao_vinculo_relacionada_id_idx" ON "manutencao_vinculo"("relacionada_id");

ALTER TABLE "manutencao_vinculo" ADD CONSTRAINT "manutencao_vinculo_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencao_vinculo" ADD CONSTRAINT "manutencao_vinculo_relacionada_id_fkey" FOREIGN KEY ("relacionada_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencao_vinculo" ADD CONSTRAINT "manutencao_vinculo_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
