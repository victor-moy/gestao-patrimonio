-- O relatório de execução deixou de ser exigido: a OS assinada válida basta para o chamado civil seguir para a confirmação
-- da Unidade. Chamados que já tinham a OS assinada e esperavam só o relatório avançam agora (a regra nova só roda no envio
-- de um documento, e a OS deles já estava enviada). Só dados; o enum TipoDocumentoOS não muda (registros antigos continuam válidos).
UPDATE "manutencao" m
SET "status" = 'AGUARDANDO_RETORNO',
    "aguardando_retorno_em" = NOW()
WHERE m."tipo" = 'CIVIL'
  AND m."status" = 'EXECUTADO'
  AND EXISTS (
    SELECT 1
    FROM "ordem_servico" os
    JOIN "documento_os" d ON d."ordem_servico_id" = os."id"
    WHERE os."manutencao_id" = m."id"
      AND d."tipo" = 'OS_ASSINADA'
      AND d."recusado_em" IS NULL
  );
