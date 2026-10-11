-- Chat dentro de solicitações e manutenções
CREATE TABLE "mensagem_chat" (
    "id" TEXT NOT NULL,
    "solicitacao_id" TEXT,
    "manutencao_id" TEXT,
    "autor_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagem_chat_pkey" PRIMARY KEY ("id"),
    -- cada mensagem pertence a exatamente uma conversa
    CONSTRAINT "mensagem_chat_um_contexto" CHECK (num_nonnulls("solicitacao_id", "manutencao_id") = 1)
);

CREATE INDEX "mensagem_chat_solicitacao_id_criado_em_idx" ON "mensagem_chat"("solicitacao_id", "criado_em");
CREATE INDEX "mensagem_chat_manutencao_id_criado_em_idx" ON "mensagem_chat"("manutencao_id", "criado_em");

ALTER TABLE "mensagem_chat" ADD CONSTRAINT "mensagem_chat_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagem_chat" ADD CONSTRAINT "mensagem_chat_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagem_chat" ADD CONSTRAINT "mensagem_chat_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
