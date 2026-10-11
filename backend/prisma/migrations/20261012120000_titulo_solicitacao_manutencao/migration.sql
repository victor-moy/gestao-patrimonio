-- Título opcional para reconhecer solicitações e manutenções nas listas
ALTER TABLE "solicitacao" ADD COLUMN "titulo" VARCHAR(80);
ALTER TABLE "manutencao" ADD COLUMN "titulo" VARCHAR(80);
