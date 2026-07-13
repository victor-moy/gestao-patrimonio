/*
  Warnings:

  - You are about to drop the column `quantidade_branet` on the `estoque_galpao` table. All the data in the column will be lost.
  - You are about to drop the column `quantidade_interna` on the `estoque_galpao` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "estoque_galpao" DROP COLUMN "quantidade_branet",
DROP COLUMN "quantidade_interna",
ADD COLUMN     "quantidade" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "movimentacao_estoque" (
    "id" TEXT NOT NULL,
    "estoque_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "unidade_destino_id" TEXT,
    "atualizado_no_branet" BOOLEAN NOT NULL DEFAULT false,
    "usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacao_estoque_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "movimentacao_estoque" ADD CONSTRAINT "movimentacao_estoque_estoque_id_fkey" FOREIGN KEY ("estoque_id") REFERENCES "estoque_galpao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_estoque" ADD CONSTRAINT "movimentacao_estoque_unidade_destino_id_fkey" FOREIGN KEY ("unidade_destino_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao_estoque" ADD CONSTRAINT "movimentacao_estoque_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
