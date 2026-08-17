-- Overhaul do módulo de Solicitações (ver plano de implementação):
-- novos TipoUnidade/TipoSolicitacao, motivo de baixa, cessão externa,
-- foto anexa, SLA de expiração e estoque por galpão (2 pools reais).

-- 1) TipoUnidade: substitui UBS/UME/CAC pela nova taxonomia do cliente
CREATE TYPE "TipoUnidade_new" AS ENUM ('UBSF', 'UPA', 'PA', 'FARMACIA', 'SERVICO_ESPECIAL', 'SERVICO_VIGILANCIA', 'UNIDADE_ADMINISTRATIVA', 'GALPAO', 'OUTRO');

ALTER TABLE "unidade" ALTER COLUMN "tipo" TYPE "TipoUnidade_new" USING (
  CASE "tipo"::text
    WHEN 'UBS' THEN 'UBSF'
    WHEN 'UME' THEN 'UNIDADE_ADMINISTRATIVA'
    WHEN 'CAC' THEN 'SERVICO_ESPECIAL'
    WHEN 'GALPAO' THEN 'GALPAO'
    ELSE 'OUTRO'
  END
)::"TipoUnidade_new";

DROP TYPE "TipoUnidade";
ALTER TYPE "TipoUnidade_new" RENAME TO "TipoUnidade";

-- 2) TipoSolicitacao: NOVO_ITEM -> AMPLIACAO; SUBSTITUICAO é um tipo novo,
-- sem correspondente anterior.
CREATE TYPE "TipoSolicitacao_new" AS ENUM ('SUBSTITUICAO', 'AMPLIACAO', 'CESSAO_USO', 'EMPRESTIMO', 'RECOLHA');

ALTER TABLE "solicitacao" ALTER COLUMN "tipo" TYPE "TipoSolicitacao_new" USING (
  CASE "tipo"::text
    WHEN 'NOVO_ITEM' THEN 'AMPLIACAO'
    ELSE "tipo"::text
  END
)::"TipoSolicitacao_new";

DROP TYPE "TipoSolicitacao";
ALTER TYPE "TipoSolicitacao_new" RENAME TO "TipoSolicitacao";

-- 3) StatusEquipamento: cessão externa passa a marcar o equipamento como CEDIDO
ALTER TYPE "StatusEquipamento" ADD VALUE IF NOT EXISTS 'CEDIDO';

-- 4) StatusSolicitacao: fechamento automático por SLA
ALTER TYPE "StatusSolicitacao" ADD VALUE IF NOT EXISTS 'EXPIRADA';

-- 5) Motivo de baixa (leilão, extravio, roubo, substituição...)
CREATE TYPE "MotivoBaixa" AS ENUM ('LEILAO', 'EXTRAVIO', 'ROUBO', 'SUBSTITUICAO', 'OUTRO');
ALTER TABLE "equipamento" ADD COLUMN "motivo_baixa" "MotivoBaixa";

-- 6) Solicitacao: foto anexa (qualquer tipo) e entidade externa (cessão de uso)
ALTER TABLE "solicitacao" ADD COLUMN "foto_url" TEXT;
ALTER TABLE "solicitacao" ADD COLUMN "entidade_externa_nome" TEXT;

-- 7) EstoqueGalpao: dimensão de local (só existem 2 galpões operacionais reais)
ALTER TABLE "estoque_galpao" ADD COLUMN "unidade_id" TEXT;

-- Backfill: toda linha existente pertence ao único galpão que havia até aqui
UPDATE "estoque_galpao"
SET "unidade_id" = (SELECT "id" FROM "unidade" WHERE "tipo" = 'GALPAO' ORDER BY "criado_em" ASC LIMIT 1)
WHERE "unidade_id" IS NULL;

ALTER TABLE "estoque_galpao" ALTER COLUMN "unidade_id" SET NOT NULL;

DROP INDEX "estoque_galpao_tipo_equipamento_id_key";

ALTER TABLE "estoque_galpao" ADD CONSTRAINT "estoque_galpao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "estoque_galpao_tipo_equipamento_id_unidade_id_key" ON "estoque_galpao"("tipo_equipamento_id", "unidade_id");
