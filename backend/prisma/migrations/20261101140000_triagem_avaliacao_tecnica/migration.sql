-- Triagem: "aguardar providências" deixa de existir; o chamado aprovado cujo serviço exige avaliação técnica
-- espera o parecer antes de ir ao prestador.
UPDATE "manutencao" SET "status" = 'PENDENTE_APROVACAO' WHERE "status" = 'AGUARDANDO_PROVIDENCIAS';

ALTER TYPE "StatusManutencao" RENAME TO "StatusManutencao_old";
CREATE TYPE "StatusManutencao" AS ENUM (
  'PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'NEGADA', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO',
  'AGUARDANDO_EXECUCAO', 'EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO', 'REENCAMINHAMENTO_SOLICITADO',
  'CONCLUIDA', 'BAIXADO'
);
ALTER TABLE "manutencao" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "manutencao" ALTER COLUMN "status" TYPE "StatusManutencao" USING ("status"::text::"StatusManutencao");
ALTER TABLE "manutencao" ALTER COLUMN "status" SET DEFAULT 'PENDENTE_APROVACAO';
DROP TYPE "StatusManutencao_old";

ALTER TABLE "manutencao" DROP COLUMN "motivo_pendencia";
ALTER TABLE "manutencao" ADD COLUMN "parecer_tecnico" TEXT;
