-- Dá um título aos pedidos que ainda não têm (abertos antes de o título existir ou criados pelo próprio
-- sistema): "<tipo> · <nome do item>". Só preenche quem está sem título e nunca sobrescreve um existente;
-- passando de 80 caracteres, corta e termina com "...".

UPDATE "solicitacao" s
SET "titulo" = CASE WHEN length(t."texto") > 80 THEN left(t."texto", 77) || '...' ELSE t."texto" END
FROM (
  SELECT
    s2."id",
    (CASE s2."tipo"::text
       WHEN 'SUBSTITUICAO' THEN 'Substituição'
       WHEN 'AMPLIACAO' THEN 'Ampliação'
       WHEN 'CESSAO_USO' THEN 'Cessão de Uso'
       WHEN 'EMPRESTIMO' THEN 'Empréstimo'
       WHEN 'RECOLHA' THEN 'Recolha'
       ELSE s2."tipo"::text
     END)
    || ' · ' ||
    -- mesmo critério da tela: com equipamento vale o tipo dele (ou a descrição); sem, o tipo do item pedido
    COALESCE(
      CASE WHEN s2."equipamento_id" IS NOT NULL THEN COALESCE(te_eq."nome", e."descricao") END,
      te."nome",
      'Item'
    ) AS "texto"
  FROM "solicitacao" s2
  LEFT JOIN "equipamento" e ON e."id" = s2."equipamento_id"
  LEFT JOIN "tipo_equipamento" te_eq ON te_eq."id" = e."tipo_equipamento_id"
  LEFT JOIN "tipo_equipamento" te ON te."id" = s2."tipo_equipamento_id"
  WHERE s2."titulo" IS NULL
) t
WHERE s."id" = t."id";

UPDATE "manutencao" m
SET "titulo" = CASE WHEN length(t."texto") > 80 THEN left(t."texto", 77) || '...' ELSE t."texto" END
FROM (
  SELECT
    m2."id",
    'Manutenção · ' || COALESCE(te."nome", e."descricao", 'Equipamento') AS "texto"
  FROM "manutencao" m2
  JOIN "equipamento" e ON e."id" = m2."equipamento_id"
  LEFT JOIN "tipo_equipamento" te ON te."id" = e."tipo_equipamento_id"
  WHERE m2."titulo" IS NULL
) t
WHERE m."id" = t."id";
