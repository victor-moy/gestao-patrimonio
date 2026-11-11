-- Resolução automática: sem resposta da Unidade em 7 dias corridos, o chamado civil é dado como resolvido
ALTER TABLE "manutencao"
  ADD COLUMN "aguardando_retorno_em" TIMESTAMP(3),
  ADD COLUMN "resolvido_automaticamente_em" TIMESTAMP(3);

-- Chamados que já aguardam retorno: a contagem parte da última atualização
UPDATE "manutencao" SET "aguardando_retorno_em" = "atualizado_em" WHERE "status" = 'AGUARDANDO_RETORNO';
