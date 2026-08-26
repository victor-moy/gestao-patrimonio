-- Novo fluxo de aprovação de Ampliação/Substituição (feedback do Gestor de
-- Patrimônio): aprovação decide reservado/aguardando disponibilidade sem
-- expor ata ao solicitante; validação final manual após a unidade confirmar.

ALTER TYPE "StatusSolicitacao" ADD VALUE IF NOT EXISTS 'RESERVADO';
ALTER TYPE "StatusSolicitacao" ADD VALUE IF NOT EXISTS 'AGUARDANDO_DISPONIBILIDADE';
ALTER TYPE "StatusSolicitacao" ADD VALUE IF NOT EXISTS 'AGUARDANDO_VALIDACAO';

ALTER TABLE "solicitacao" ADD COLUMN "pedido_entrega_registrado_em" TIMESTAMP(3);
