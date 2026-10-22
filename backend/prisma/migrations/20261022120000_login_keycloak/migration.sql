-- Login pelo Keycloak da Prefeitura: o usuário novo entra sem acesso até um Administrador atribuir o perfil.
ALTER TYPE "Perfil" ADD VALUE 'SEM_ACESSO';

ALTER TABLE "usuario" ALTER COLUMN "senha_hash" DROP NOT NULL;
ALTER TABLE "usuario" ADD COLUMN "keycloak_sub" TEXT;
CREATE UNIQUE INDEX "usuario_keycloak_sub_key" ON "usuario"("keycloak_sub");
