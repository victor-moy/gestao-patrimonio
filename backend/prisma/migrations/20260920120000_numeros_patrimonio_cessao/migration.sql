-- Cessão de Uso: nº de patrimônio de cada unidade do item cedido, informado na criação
ALTER TABLE "solicitacao" ADD COLUMN "numeros_patrimonio" TEXT[] NOT NULL DEFAULT '{}';
