-- A abertura de manutenção não pede mais justificativa (só a descrição do problema);
-- a coluna continua existindo para os chamados antigos.
ALTER TABLE "manutencao" ALTER COLUMN "justificativa" DROP NOT NULL;

-- Configurações editáveis pelo Gestor de Patrimônio (ex.: WhatsApp do atendimento)
CREATE TABLE "configuracao_sistema" (
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_sistema_pkey" PRIMARY KEY ("chave")
);
