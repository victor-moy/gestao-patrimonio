-- Preço de referência opcional no cadastro de Tipo de Equipamento (feedback 21/08)
ALTER TABLE "tipo_equipamento" ADD COLUMN "preco" DECIMAL(12,2);
