-- Marca o chamado aberto pela contestação da Unidade (exibido como "Contestado" enquanto espera a triagem)
ALTER TABLE "manutencao" ADD COLUMN "aberto_por_contestacao" BOOLEAN NOT NULL DEFAULT false;

-- Chamados antigos: os que nasceram de um atendimento contestado
UPDATE "manutencao" m
SET "aberto_por_contestacao" = true
FROM "manutencao" o
WHERE m."reencaminhado_de_id" = o."id" AND o."contestacao_unidade" IS NOT NULL;
