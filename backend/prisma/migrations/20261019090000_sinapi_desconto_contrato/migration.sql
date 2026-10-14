-- Manutenção civil: o prestador escolhe serviços e materiais da tabela SINAPI (sem digitar preço) e o
-- desconto da proposta vencedora, definido por item de contrato, é aplicado sobre o preço de referência.
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

ALTER TABLE "linha_relatorio_manutencao"
  ADD COLUMN "item_sinapi_id" TEXT,
  ADD COLUMN "codigo_sinapi" VARCHAR(20),
  ADD COLUMN "preco_sinapi" DECIMAL(12,2),
  ADD COLUMN "desconto_percentual" DECIMAL(5,2);

CREATE INDEX "linha_relatorio_manutencao_item_sinapi_id_idx" ON "linha_relatorio_manutencao"("item_sinapi_id");

ALTER TABLE "linha_relatorio_manutencao"
  ADD CONSTRAINT "linha_relatorio_manutencao_item_sinapi_id_fkey"
  FOREIGN KEY ("item_sinapi_id") REFERENCES "item_sinapi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
