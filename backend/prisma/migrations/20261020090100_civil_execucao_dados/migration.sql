-- Chamados civis que estavam na etapa de orçamento passam a aguardar a execução (o valor só é conhecido na
-- finalização, a partir dos serviços executados). Fica em arquivo próprio porque o valor novo do enum só pode
-- ser usado depois que a migração que o cria for confirmada.
UPDATE "manutencao"
SET "status" = 'AGUARDANDO_EXECUCAO', "orcamento_valor" = NULL, "orcamento_descricao" = NULL
WHERE "tipo" = 'CIVIL' AND "status" IN ('AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO');
