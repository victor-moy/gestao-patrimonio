-- Os escopos iniciais passam a ter o nome completo ("Manutenção preventiva" etc.). Só renomeia os três
-- criados pelo sistema; escopos cadastrados pelos gestores não são tocados.
UPDATE "escopo_servico" SET "nome" = 'Manutenção preventiva e corretiva'
 WHERE "nome" = 'Preventiva e corretiva'
   AND NOT EXISTS (SELECT 1 FROM "escopo_servico" WHERE "nome" = 'Manutenção preventiva e corretiva');
UPDATE "escopo_servico" SET "nome" = 'Manutenção preventiva'
 WHERE "nome" = 'Preventiva'
   AND NOT EXISTS (SELECT 1 FROM "escopo_servico" WHERE "nome" = 'Manutenção preventiva');
UPDATE "escopo_servico" SET "nome" = 'Manutenção corretiva'
 WHERE "nome" = 'Corretiva'
   AND NOT EXISTS (SELECT 1 FROM "escopo_servico" WHERE "nome" = 'Manutenção corretiva');
