-- Tipos de item passam a informar que manutenção aceitam (preventiva, corretiva ou ambas) e o preço de mercado.
-- Escopos de serviço passam a informar que manutenção cobrem. Tudo que já existe segue aceitando os dois tipos.
ALTER TABLE "tipo_equipamento"
    ADD COLUMN "permite_preventiva" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "permite_corretiva" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "preco_mercado" DECIMAL(12,2);

ALTER TABLE "escopo_servico"
    ADD COLUMN "cobre_preventiva" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "cobre_corretiva" BOOLEAN NOT NULL DEFAULT true;

UPDATE "escopo_servico" SET "cobre_corretiva" = false WHERE "nome" = 'Preventiva';
UPDATE "escopo_servico" SET "cobre_preventiva" = false WHERE "nome" = 'Corretiva';
