-- Saídas da avaliação técnica: devolver à triagem (já avaliados), pedir informações e marcar vistoria
ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_VISTORIA';
ALTER TYPE "StatusManutencao" ADD VALUE 'AVALIADO';

ALTER TABLE "manutencao"
  ADD COLUMN "informacoes_solicitadas" TEXT,
  ADD COLUMN "parecer_vistoria" TEXT;
