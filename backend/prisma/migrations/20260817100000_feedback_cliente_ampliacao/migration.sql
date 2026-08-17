-- Feedback do cliente (reunião 17/08): número do pedido Branet + tombamento
-- capturados pelo Gestor de Patrimônio (não mais pelo Galpão depois),
-- prioridade manual entre pedidos aguardando estoque, confirmação de
-- recebimento binária (OK/Não OK) com comparação de tombamento, e anexo
-- genérico (PDF/imagem) no lugar de "foto".

ALTER TABLE "solicitacao"
  ADD COLUMN "numero_pedido_branet" TEXT,
  ADD COLUMN "prioridade" INTEGER,
  ADD COLUMN "recebimento_ok" BOOLEAN,
  ADD COLUMN "observacao_recebimento" TEXT;

ALTER TABLE "solicitacao" RENAME COLUMN "foto_url" TO "anexo_url";

-- Etapa separada do Galpão (13/08) foi absorvida pelo checkbox do Gestor
ALTER TABLE "solicitacao" DROP COLUMN "tombamento_registrado_em";

ALTER TABLE "equipamento" ADD COLUMN "criado_por_solicitacao_id" TEXT
  REFERENCES "solicitacao"("id");
