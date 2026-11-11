-- Chamado bloqueado pela triagem: guarda o status anterior, o motivo e o tempo parado
ALTER TYPE "StatusManutencao" ADD VALUE 'BLOQUEADO';

ALTER TABLE "manutencao"
  ADD COLUMN "status_antes_bloqueio" "StatusManutencao",
  ADD COLUMN "motivo_bloqueio" TEXT,
  ADD COLUMN "bloqueado_em" TIMESTAMP(3),
  ADD COLUMN "tempo_bloqueado_segundos" INTEGER NOT NULL DEFAULT 0;
