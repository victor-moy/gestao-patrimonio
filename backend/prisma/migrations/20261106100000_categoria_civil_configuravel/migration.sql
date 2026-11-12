-- Categorias do chamado civil passam a ser cadastro (com perguntas), em vez de uma lista fixa no código
CREATE TYPE "TipoPergunta" AS ENUM ('OPCOES', 'TEXTO');

CREATE TABLE "categoria_civil" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categoria_civil_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categoria_civil_nome_key" ON "categoria_civil"("nome");

CREATE TABLE "pergunta_categoria" (
    "id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" "TipoPergunta" NOT NULL,
    "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "pergunta_categoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pergunta_categoria_categoria_id_idx" ON "pergunta_categoria"("categoria_id");
ALTER TABLE "pergunta_categoria" ADD CONSTRAINT "pergunta_categoria_categoria_id_fkey"
  FOREIGN KEY ("categoria_id") REFERENCES "categoria_civil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "resposta_chamado" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "pergunta_id" TEXT,
    "pergunta_texto" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "resposta_chamado_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resposta_chamado_manutencao_id_idx" ON "resposta_chamado"("manutencao_id");
ALTER TABLE "resposta_chamado" ADD CONSTRAINT "resposta_chamado_manutencao_id_fkey"
  FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resposta_chamado" ADD CONSTRAINT "resposta_chamado_pergunta_id_fkey"
  FOREIGN KEY ("pergunta_id") REFERENCES "pergunta_categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "manutencao_problema" (
    "id" TEXT NOT NULL,
    "manutencao_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criado_por_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manutencao_problema_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "manutencao_problema_manutencao_id_idx" ON "manutencao_problema"("manutencao_id");
ALTER TABLE "manutencao_problema" ADD CONSTRAINT "manutencao_problema_manutencao_id_fkey"
  FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencao_problema" ADD CONSTRAINT "manutencao_problema_criado_por_id_fkey"
  FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- As 8 categorias que existiam no código viram cadastro
INSERT INTO "categoria_civil" ("id", "nome", "ordem") VALUES
  (gen_random_uuid()::text, 'Hidráulica', 1),
  (gen_random_uuid()::text, 'Elétrica', 2),
  (gen_random_uuid()::text, 'Infiltração', 3),
  (gen_random_uuid()::text, 'Alvenaria e pintura', 4),
  (gen_random_uuid()::text, 'Cobertura', 5),
  (gen_random_uuid()::text, 'Esquadrias e vidros', 6),
  (gen_random_uuid()::text, 'Climatização', 7),
  (gen_random_uuid()::text, 'Outros', 8);

ALTER TABLE "manutencao" ADD COLUMN "categoria_civil_id" TEXT;
UPDATE "manutencao" m SET "categoria_civil_id" = c."id"
FROM "categoria_civil" c
WHERE c."nome" = CASE m."categoria_civil"::text
  WHEN 'HIDRAULICA' THEN 'Hidráulica'
  WHEN 'ELETRICA' THEN 'Elétrica'
  WHEN 'INFILTRACAO' THEN 'Infiltração'
  WHEN 'ALVENARIA_PINTURA' THEN 'Alvenaria e pintura'
  WHEN 'COBERTURA' THEN 'Cobertura'
  WHEN 'ESQUADRIAS_VIDROS' THEN 'Esquadrias e vidros'
  WHEN 'CLIMATIZACAO_CIVIL' THEN 'Climatização'
  WHEN 'OUTROS' THEN 'Outros'
END;
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_categoria_civil_id_fkey"
  FOREIGN KEY ("categoria_civil_id") REFERENCES "categoria_civil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "manutencao_categoria_civil_id_idx" ON "manutencao"("categoria_civil_id");

ALTER TABLE "manutencao" DROP COLUMN "categoria_civil";
DROP TYPE "CategoriaProblemaCivil";
