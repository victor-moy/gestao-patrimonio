-- A manutenção passa a ser vinculada a um item de contrato (serviço + escopo). O contrato_id continua
-- preenchido (é o contrato do item) e as manutenções antigas, que só tinham o contrato, ficam sem item.
ALTER TABLE "manutencao" ADD COLUMN "contrato_item_id" TEXT;
CREATE INDEX "manutencao_contrato_item_id_idx" ON "manutencao"("contrato_item_id");
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_contrato_item_id_fkey"
    FOREIGN KEY ("contrato_item_id") REFERENCES "contrato_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
