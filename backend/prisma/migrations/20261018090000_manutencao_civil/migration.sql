-- Manutenção civil: chamados sem equipamento (unidade, sala ou instalação), com relatório de serviços e materiais.
CREATE TYPE "TipoManutencao" AS ENUM ('EQUIPAMENTO', 'CIVIL');
CREATE TYPE "CategoriaProblemaCivil" AS ENUM ('HIDRAULICA', 'ELETRICA', 'INFILTRACAO', 'ALVENARIA_PINTURA', 'COBERTURA', 'ESQUADRIAS_VIDROS', 'CLIMATIZACAO_CIVIL', 'OUTROS');
CREATE TYPE "TipoLinhaRelatorio" AS ENUM ('SERVICO', 'MATERIAL');
CREATE TYPE "AprovacaoLinhaRelatorio" AS ENUM ('NAO_REQUER', 'PENDENTE', 'APROVADA', 'REJEITADA');

ALTER TYPE "StatusManutencao" ADD VALUE 'AGUARDANDO_PROVIDENCIAS';

ALTER TABLE "escopo_servico" ADD COLUMN "cobre_civil" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "manutencao"
  ADD COLUMN "tipo" "TipoManutencao" NOT NULL DEFAULT 'EQUIPAMENTO',
  ADD COLUMN "local_afetado" TEXT,
  ADD COLUMN "categoria_civil" "CategoriaProblemaCivil",
  ADD COLUMN "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "motivo_pendencia" TEXT,
  ADD COLUMN "contestacao_unidade" TEXT,
  ADD COLUMN "conferido_medicao_em" TIMESTAMP(3),
  ADD COLUMN "conferido_medicao_por_id" TEXT,
  ALTER COLUMN "equipamento_id" DROP NOT NULL;

-- Equipamento opcional: a relação passa a ser ON DELETE SET NULL, como o Prisma gera para campo opcional
ALTER TABLE "manutencao" DROP CONSTRAINT "manutencao_equipamento_id_fkey";
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_equipamento_id_fkey"
    FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Equipamento só pode faltar no chamado civil
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_equipamento_ou_civil"
  CHECK ("tipo" = 'CIVIL' OR "equipamento_id" IS NOT NULL);

CREATE TABLE "linha_relatorio_manutencao" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "tipo" "TipoLinhaRelatorio" NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade_medida" VARCHAR(20),
    "quantidade" DECIMAL(12,3) NOT NULL,
    "valor_unitario" DECIMAL(12,2) NOT NULL,
    "justificativa" TEXT,
    "aprovacao" "AprovacaoLinhaRelatorio" NOT NULL DEFAULT 'NAO_REQUER',
    "decidida_por_id" TEXT,
    "decidida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "linha_relatorio_manutencao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "linha_relatorio_manutencao_manutencao_id_idx" ON "linha_relatorio_manutencao"("manutencao_id");
ALTER TABLE "linha_relatorio_manutencao" ADD CONSTRAINT "linha_relatorio_manutencao_manutencao_id_fkey"
    FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
