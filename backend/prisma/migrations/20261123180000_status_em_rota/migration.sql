-- Chamado civil: o prestador gera a OS e o chamado fica "em rota"; só "Iniciar execução" o leva a "em execução".
-- Em arquivo separado do UPDATE porque o PostgreSQL não deixa usar o valor novo do enum na mesma transação.
ALTER TYPE "StatusManutencao" ADD VALUE 'EM_ROTA';
