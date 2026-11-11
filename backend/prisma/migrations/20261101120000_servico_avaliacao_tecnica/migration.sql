-- Tipo de serviço: indica se o chamado coberto por ele precisa de avaliação técnica antes de seguir.
ALTER TABLE "servico_contrato" ADD COLUMN "exige_avaliacao_tecnica" BOOLEAN NOT NULL DEFAULT false;
