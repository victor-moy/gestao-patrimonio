-- Reencaminhamento de chamados: status do pedido, vínculo entre atendimentos do mesmo caso
-- e ligação da baixa/substituição com o atendimento que a originou. Só adiciona; nada é alterado.
ALTER TYPE "StatusManutencao" ADD VALUE 'REENCAMINHAMENTO_SOLICITADO';

ALTER TABLE "manutencao"
  ADD COLUMN "motivo_reencaminhamento" TEXT,
  ADD COLUMN "reencaminhamento_solicitado_em" TIMESTAMP(3),
  ADD COLUMN "reencaminhamento_confirmado_em" TIMESTAMP(3),
  ADD COLUMN "reencaminhado_de_id" TEXT,
  ADD COLUMN "caso_id" TEXT;

ALTER TABLE "manutencao"
  ADD CONSTRAINT "manutencao_reencaminhado_de_id_fkey" FOREIGN KEY ("reencaminhado_de_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "manutencao_caso_id_fkey" FOREIGN KEY ("caso_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "manutencao_caso_id_idx" ON "manutencao"("caso_id");
CREATE INDEX "manutencao_reencaminhado_de_id_idx" ON "manutencao"("reencaminhado_de_id");

ALTER TABLE "solicitacao" ADD COLUMN "manutencao_origem_id" TEXT;
ALTER TABLE "solicitacao"
  ADD CONSTRAINT "solicitacao_manutencao_origem_id_fkey" FOREIGN KEY ("manutencao_origem_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "solicitacao_manutencao_origem_id_idx" ON "solicitacao"("manutencao_origem_id");
