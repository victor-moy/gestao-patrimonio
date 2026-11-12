-- O escopo de serviço deixou de ser usado: o item de contrato não escolhe mais escopo e a compatibilidade
-- entre o item e o tipo de manutenção não é mais conferida. Remove a coluna (com a chave estrangeira e o índice) e a tabela.
ALTER TABLE "contrato_item" DROP COLUMN "escopo_id";
DROP TABLE "escopo_servico";
