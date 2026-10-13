-- Unifica Gestor de Patrimônio e Gestor de Manutenção em um único perfil, OPERADOR, com as permissões dos dois.
-- Os usuários existentes dos dois perfis viram OPERADOR; os demais perfis ficam como estão.
ALTER TYPE "Perfil" RENAME TO "Perfil_antigo";
CREATE TYPE "Perfil" AS ENUM ('OPERADOR', 'UNIDADE', 'GALPAO', 'TERCEIRIZADA');
ALTER TABLE "usuario" ALTER COLUMN "perfil" TYPE "Perfil" USING (
    CASE "perfil"::text
        WHEN 'GESTOR_PATRIMONIO' THEN 'OPERADOR'
        WHEN 'GESTOR_MANUTENCAO' THEN 'OPERADOR'
        ELSE "perfil"::text
    END
)::"Perfil";
DROP TYPE "Perfil_antigo";
