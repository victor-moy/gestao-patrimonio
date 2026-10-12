-- Novo perfil TERCEIRIZADA: usuário de uma empresa prestadora de serviço, vinculado ao cadastro do prestador.
ALTER TYPE "Perfil" ADD VALUE 'TERCEIRIZADA';

ALTER TABLE "usuario" ADD COLUMN "prestador_id" TEXT;
CREATE INDEX "usuario_prestador_id_idx" ON "usuario"("prestador_id");
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_prestador_id_fkey"
    FOREIGN KEY ("prestador_id") REFERENCES "prestador_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
