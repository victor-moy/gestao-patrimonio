-- Manutenção civil: chamados sem equipamento, tabela SINAPI, desconto no item de contrato e
-- registro dos serviços executados na finalização (sem orçamento prévio).
CREATE TYPE "TipoManutencao" AS ENUM ('EQUIPAMENTO', 'CIVIL');
CREATE TYPE "CategoriaProblemaCivil" AS ENUM (
  'HIDRAULICA',
  'ELETRICA',
  'INFILTRACAO',
  'ALVENARIA_PINTURA',
  'COBERTURA',
  'ESQUADRIAS_VIDROS',
  'CLIMATIZACAO_CIVIL',
  'OUTROS'
);
CREATE TYPE "TipoLinhaRelatorio" AS ENUM ('SERVICO', 'MATERIAL');

ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_PROVIDENCIAS';
ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_MEDICAO';
ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_EXECUCAO';

ALTER TABLE "escopo_servico" ADD COLUMN "cobre_civil" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "manutencao"
  ADD COLUMN "tipo" "TipoManutencao" NOT NULL DEFAULT 'EQUIPAMENTO',
  ADD COLUMN "local_afetado" TEXT,
  ADD COLUMN "categoria_civil" "CategoriaProblemaCivil",
  ADD COLUMN "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "motivo_pendencia" TEXT,
  ADD COLUMN "motivo_ajuste" TEXT,
  ADD COLUMN "contestacao_unidade" TEXT,
  ADD COLUMN "conferido_medicao_em" TIMESTAMP(3),
  ADD COLUMN "conferido_medicao_por_id" TEXT,
  ALTER COLUMN "equipamento_id" DROP NOT NULL;

-- Equipamento opcional só no civil; a FK permanece RESTRICT para preservar o histórico
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_equipamento_ou_civil"
  CHECK ("tipo" = 'CIVIL' OR "equipamento_id" IS NOT NULL);

CREATE TABLE "item_sinapi" (
  "id" TEXT NOT NULL,
  "codigo" VARCHAR(20) NOT NULL,
  "descricao" TEXT NOT NULL,
  "unidade" VARCHAR(20) NOT NULL,
  "tipo" "TipoLinhaRelatorio" NOT NULL,
  "preco" DECIMAL(12,2) NOT NULL,
  "referencia" VARCHAR(7) NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_sinapi_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "item_sinapi_codigo_key" ON "item_sinapi"("codigo");

ALTER TABLE "contrato_item"
  ADD COLUMN "desconto_percentual" DECIMAL(5,2) NOT NULL DEFAULT 0;

CREATE TABLE "linha_relatorio_manutencao" (
  "id" TEXT NOT NULL,
  "manutencao_id" TEXT NOT NULL,
  "tipo" "TipoLinhaRelatorio" NOT NULL,
  "descricao" TEXT NOT NULL,
  "unidade_medida" VARCHAR(20),
  "quantidade" DECIMAL(12,3) NOT NULL,
  "valor_unitario" DECIMAL(12,2) NOT NULL,
  "item_sinapi_id" TEXT,
  "codigo_sinapi" VARCHAR(20),
  "preco_sinapi" DECIMAL(12,2),
  "desconto_percentual" DECIMAL(5,2),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "linha_relatorio_manutencao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "linha_relatorio_manutencao_manutencao_id_idx" ON "linha_relatorio_manutencao"("manutencao_id");
CREATE INDEX "linha_relatorio_manutencao_item_sinapi_id_idx" ON "linha_relatorio_manutencao"("item_sinapi_id");
ALTER TABLE "linha_relatorio_manutencao"
  ADD CONSTRAINT "linha_relatorio_manutencao_manutencao_id_fkey"
  FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linha_relatorio_manutencao"
  ADD CONSTRAINT "linha_relatorio_manutencao_item_sinapi_id_fkey"
  FOREIGN KEY ("item_sinapi_id") REFERENCES "item_sinapi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
