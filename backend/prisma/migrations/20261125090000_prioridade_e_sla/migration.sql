-- Prioridade e prazo (SLA) do chamado civil; gravidade da categoria; horas de SLA por item de contrato
CREATE TYPE "PrioridadeManutencao" AS ENUM ('BAIXA', 'MEDIA', 'MUITO_ALTA');

ALTER TABLE "categoria_civil" ADD COLUMN "gravidade" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categoria_civil" ADD CONSTRAINT "categoria_civil_gravidade_faixa" CHECK ("gravidade" BETWEEN 0 AND 3);

ALTER TABLE "contrato_item" ADD COLUMN "sla_horas_media" INTEGER, ADD COLUMN "sla_horas_muito_alta" INTEGER;
ALTER TABLE "contrato_item" ADD CONSTRAINT "contrato_item_sla_positivo" CHECK (
  ("sla_horas_media" IS NULL OR "sla_horas_media" > 0) AND ("sla_horas_muito_alta" IS NULL OR "sla_horas_muito_alta" > 0)
);

ALTER TABLE "manutencao"
  ADD COLUMN "prioridade" "PrioridadeManutencao",
  ADD COLUMN "sla_inicio_em" TIMESTAMP(3),
  ADD COLUMN "sla_horas" INTEGER,
  ADD COLUMN "sla_fim_em" TIMESTAMP(3),
  ADD COLUMN "sla_bloqueado_segundos" INTEGER NOT NULL DEFAULT 0;
