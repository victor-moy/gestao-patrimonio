-- Manutenção civil: o orçamento prévio deixa de existir. O chamado encaminhado fica aguardando execução, o
-- prestador inicia o serviço e, ao finalizar, informa os serviços e materiais executados (tabela SINAPI) para
-- o Administrador dar a aprovação final ou pedir ajustes.
ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_EXECUCAO';

ALTER TABLE "manutencao"
  DROP COLUMN "motivo_recusa_orcamento",
  DROP COLUMN "justificativa_revisao",
  ADD COLUMN "motivo_ajuste" TEXT;
