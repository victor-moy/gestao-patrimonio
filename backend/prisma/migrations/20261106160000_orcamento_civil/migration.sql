-- Orçamento prévio do chamado civil: 3 cotações por rodada, aprovação do fiscal e dispensa por risco à vida
ALTER TABLE "servico_contrato" ADD COLUMN "exige_orcamento_previo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "manutencao"
  ADD COLUMN "instrucoes_orcamento" TEXT,
  ADD COLUMN "rodada_orcamento" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "motivo_rejeicao_orcamento" TEXT,
  ADD COLUMN "cotacao_aprovada_id" TEXT,
  ADD COLUMN "dispensa_orcamento_motivo" TEXT;

CREATE TABLE "cotacao_orcamento" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "rodada" INTEGER NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "arquivo" TEXT NOT NULL,
    "enviado_por_id" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cotacao_orcamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cotacao_orcamento_manutencao_id_rodada_idx" ON "cotacao_orcamento"("manutencao_id", "rodada");
ALTER TABLE "cotacao_orcamento" ADD CONSTRAINT "cotacao_orcamento_manutencao_id_fkey"
  FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cotacao_orcamento" ADD CONSTRAINT "cotacao_orcamento_enviado_por_id_fkey"
  FOREIGN KEY ("enviado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
