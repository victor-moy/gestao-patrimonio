-- Um chamado pode afetar mais de um setor: troca a coluna única por uma tabela de ligação.
CREATE TABLE "manutencao_setor" (
    "manutencao_id" TEXT NOT NULL,
    "setor_id" TEXT NOT NULL,

    CONSTRAINT "manutencao_setor_pkey" PRIMARY KEY ("manutencao_id", "setor_id")
);

CREATE INDEX "manutencao_setor_setor_id_idx" ON "manutencao_setor"("setor_id");
ALTER TABLE "manutencao_setor" ADD CONSTRAINT "manutencao_setor_manutencao_id_fkey" FOREIGN KEY ("manutencao_id") REFERENCES "manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manutencao_setor" ADD CONSTRAINT "manutencao_setor_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "manutencao_setor" ("manutencao_id", "setor_id")
SELECT "id", "setor_id" FROM "manutencao" WHERE "setor_id" IS NOT NULL;

ALTER TABLE "manutencao" DROP CONSTRAINT "manutencao_setor_id_fkey";
DROP INDEX "manutencao_setor_id_idx";
ALTER TABLE "manutencao" DROP COLUMN "setor_id";
