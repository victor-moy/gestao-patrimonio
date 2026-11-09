-- Avaliação técnica completa: setores, orientações à terceirizada e encerramento (encerrado, duplicado, unificado).
ALTER TYPE "StatusManutencao" ADD VALUE 'ENCERRADA';

CREATE TYPE "TipoEncerramento" AS ENUM ('ENCERRADO', 'DUPLICADO', 'UNIFICADO');

CREATE TABLE "setor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "setor_unidade_id_nome_key" ON "setor"("unidade_id", "nome");
ALTER TABLE "setor" ADD CONSTRAINT "setor_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "manutencao"
  ADD COLUMN "orientacoes_terceirizada" TEXT,
  ADD COLUMN "setor_id" TEXT,
  ADD COLUMN "tipo_encerramento" "TipoEncerramento",
  ADD COLUMN "motivo_encerramento" TEXT,
  ADD COLUMN "chamado_original_id" TEXT;

CREATE INDEX "manutencao_setor_id_idx" ON "manutencao"("setor_id");
CREATE INDEX "manutencao_chamado_original_id_idx" ON "manutencao"("chamado_original_id");
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_chamado_original_id_fkey" FOREIGN KEY ("chamado_original_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
