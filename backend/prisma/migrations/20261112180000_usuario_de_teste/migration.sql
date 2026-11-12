-- Usuário de teste: só estas contas aparecem no "Entrar como" e só nelas se pode entrar.
ALTER TABLE "usuario" ADD COLUMN "usuario_teste" BOOLEAN NOT NULL DEFAULT false;

-- Hoje o sistema só tem dados de teste (ver AGENTS.md): quem já existe continua disponível no "Entrar como".
-- Em produção com dados reais, desmarque a flag em Configurações › Usuários.
UPDATE "usuario" SET "usuario_teste" = true;
