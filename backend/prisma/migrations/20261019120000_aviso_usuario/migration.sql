-- Avisos in-app da Home (Atualizações), por usuário, com leitura própria.
CREATE TABLE "aviso_usuario" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "href" TEXT,
    "solicitacao_id" TEXT,
    "manutencao_id" TEXT,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_usuario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aviso_usuario_usuario_id_lida_em_criado_em_idx" ON "aviso_usuario"("usuario_id", "lida_em", "criado_em");
CREATE INDEX "aviso_usuario_solicitacao_id_idx" ON "aviso_usuario"("solicitacao_id");
CREATE INDEX "aviso_usuario_manutencao_id_idx" ON "aviso_usuario"("manutencao_id");

ALTER TABLE "aviso_usuario" ADD CONSTRAINT "aviso_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aviso_usuario" ADD CONSTRAINT "aviso_usuario_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aviso_usuario" ADD CONSTRAINT "aviso_usuario_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
