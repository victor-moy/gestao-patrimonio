-- Anexos (prints e PDFs) do relato de problema
ALTER TABLE "relato_problema" ADD COLUMN "anexos" TEXT[] DEFAULT ARRAY[]::TEXT[];
