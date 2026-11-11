-- A resolução automática vale só para o chamado civil, e os que já aguardam retorno ganham o prazo cheio de 7 dias
-- a partir desta migração (a contagem anterior partia da última atualização e resolveria de uma vez os chamados antigos).
UPDATE "manutencao" SET "aguardando_retorno_em" = NOW() WHERE "status" = 'AGUARDANDO_RETORNO' AND "tipo" = 'CIVIL';
UPDATE "manutencao" SET "aguardando_retorno_em" = NULL WHERE "tipo" <> 'CIVIL';

-- O download dos PDFs confere a autorização consultando estas tabelas pelo caminho do arquivo
CREATE INDEX "cotacao_orcamento_arquivo_idx" ON "cotacao_orcamento"("arquivo");
CREATE INDEX "documento_os_arquivo_idx" ON "documento_os"("arquivo");
