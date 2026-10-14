-- Manutenção civil, fluxo simplificado: o relatório de serviços e materiais passa a ser o orçamento
-- (aprovado uma vez pelo Administrador) e a medição é autorizada em etapa própria depois da Unidade.
ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_MEDICAO';

ALTER TABLE "manutencao"
  ADD COLUMN "motivo_recusa_orcamento" TEXT,
  ADD COLUMN "justificativa_revisao" TEXT;

ALTER TABLE "linha_relatorio_manutencao"
  DROP COLUMN "justificativa",
  DROP COLUMN "aprovacao",
  DROP COLUMN "decidida_por_id",
  DROP COLUMN "decidida_em";

DROP TYPE "AprovacaoLinhaRelatorio";
