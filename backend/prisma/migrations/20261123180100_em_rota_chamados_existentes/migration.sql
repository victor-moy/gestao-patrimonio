-- Chamados civis que já têm OS mas ainda não começaram a execução (sem entrada registrada, sem serviços lançados,
-- sem finalização anterior) passam a "em rota". Os que já estão executando seguem em "em execução".
UPDATE "manutencao" m
SET "status" = 'EM_ROTA'
WHERE m."tipo" = 'CIVIL'
  AND m."status" = 'EM_EXECUCAO'
  AND EXISTS (
    SELECT 1 FROM "ordem_servico" o
    WHERE o."manutencao_id" = m."id" AND o."entrada_em" IS NULL AND o."executada_em" IS NULL
  )
  AND NOT EXISTS (SELECT 1 FROM "linha_relatorio_manutencao" l WHERE l."manutencao_id" = m."id");
