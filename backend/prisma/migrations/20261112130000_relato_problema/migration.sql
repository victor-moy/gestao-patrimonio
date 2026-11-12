-- Relato de problema: botão "Relatar problema" no sistema, lido pelo Administrador em Configurações › Relatos.
CREATE TYPE "StatusRelato" AS ENUM ('ABERTO', 'EM_ANALISE', 'RESOLVIDO');

CREATE TABLE "relato_problema" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "tela" TEXT NOT NULL,
    "esperado" TEXT,
    "aconteceu" TEXT NOT NULL,
    "navegador" TEXT,
    "status" "StatusRelato" NOT NULL DEFAULT 'ABERTO',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relato_problema_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "relato_problema_status_criado_em_idx" ON "relato_problema"("status", "criado_em");
CREATE INDEX "relato_problema_usuario_id_idx" ON "relato_problema"("usuario_id");

ALTER TABLE "relato_problema" ADD CONSTRAINT "relato_problema_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
