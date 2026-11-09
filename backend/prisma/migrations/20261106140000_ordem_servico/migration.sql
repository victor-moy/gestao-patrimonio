-- Ordem de serviço do chamado civil, execução e documentos pendentes
ALTER TYPE "StatusManutencao" ADD VALUE 'EXECUTADO';

CREATE TYPE "ResultadoExecucao" AS ENUM ('TOTAL', 'PARCIAL');
CREATE TYPE "TipoDocumentoOS" AS ENUM ('OS_ASSINADA', 'RELATORIO');

CREATE TABLE "ordem_servico" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "equipe" TEXT NOT NULL,
    "data_prevista" DATE NOT NULL,
    "escopo" TEXT NOT NULL,
    "gerada_por_id" TEXT NOT NULL,
    "gerada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entrada_em" TIMESTAMP(3),
    "saida_em" TIMESTAMP(3),
    "resultado" "ResultadoExecucao",
    "observacao_execucao" TEXT,
    "executada_em" TIMESTAMP(3),
    CONSTRAINT "ordem_servico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ordem_servico_numero_key" ON "ordem_servico"("numero");
CREATE UNIQUE INDEX "ordem_servico_manutencao_id_key" ON "ordem_servico"("manutencao_id");
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_manutencao_id_fkey"
  FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_gerada_por_id_fkey"
  FOREIGN KEY ("gerada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "documento_os" (
    "id" TEXT NOT NULL,
    "ordem_servico_id" TEXT NOT NULL,
    "tipo" "TipoDocumentoOS" NOT NULL,
    "arquivo" TEXT NOT NULL,
    "enviado_por_id" TEXT NOT NULL,
    "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recusado_em" TIMESTAMP(3),
    "motivo_recusa" TEXT,
    CONSTRAINT "documento_os_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documento_os_ordem_servico_id_idx" ON "documento_os"("ordem_servico_id");
ALTER TABLE "documento_os" ADD CONSTRAINT "documento_os_ordem_servico_id_fkey"
  FOREIGN KEY ("ordem_servico_id") REFERENCES "ordem_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documento_os" ADD CONSTRAINT "documento_os_enviado_por_id_fkey"
  FOREIGN KEY ("enviado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
