-- Até quando cada usuário já leu cada conversa (base das mensagens não lidas)
CREATE TABLE "conversa_leitura" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "solicitacao_id" TEXT,
    "manutencao_id" TEXT,
    "lida_ate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversa_leitura_pkey" PRIMARY KEY ("id"),
    -- cada registro pertence a exatamente uma conversa
    CONSTRAINT "conversa_leitura_um_contexto" CHECK (num_nonnulls("solicitacao_id", "manutencao_id") = 1)
);

-- um registro por usuário e conversa (permite o upsert atômico ao marcar como lida)
CREATE UNIQUE INDEX "conversa_leitura_usuario_id_solicitacao_id_key" ON "conversa_leitura"("usuario_id", "solicitacao_id");
CREATE UNIQUE INDEX "conversa_leitura_usuario_id_manutencao_id_key" ON "conversa_leitura"("usuario_id", "manutencao_id");

ALTER TABLE "conversa_leitura" ADD CONSTRAINT "conversa_leitura_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversa_leitura" ADD CONSTRAINT "conversa_leitura_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversa_leitura" ADD CONSTRAINT "conversa_leitura_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
