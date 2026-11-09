-- O orçamento prévio do chamado civil passou a ser uma entrega de PDFs: fornecedor e valor deixam de ser obrigatórios
-- (o valor é informado pelo fiscal ao aprovar). Registros antigos, com fornecedor e valor, continuam como estão.
ALTER TABLE "cotacao_orcamento" ALTER COLUMN "fornecedor" DROP NOT NULL;
ALTER TABLE "cotacao_orcamento" ALTER COLUMN "valor" DROP NOT NULL;
