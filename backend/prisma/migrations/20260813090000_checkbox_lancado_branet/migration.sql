-- Separa "lançado no Branet" (checkbox do Gestor de Patrimônio, ao reservar)
-- de "tombamento cadastrado" (ação do Galpão, quando o item chega).
ALTER TABLE "solicitacao" ADD COLUMN "tombamento_registrado_em" TIMESTAMP(3);
