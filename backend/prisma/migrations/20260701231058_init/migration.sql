-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO', 'UNIDADE', 'GALPAO');

-- CreateEnum
CREATE TYPE "TipoUnidade" AS ENUM ('UBS', 'UME', 'CAC', 'GALPAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoConservacao" AS ENUM ('OTIMO', 'BOM', 'REGULAR', 'RUIM', 'PESSIMO');

-- CreateEnum
CREATE TYPE "StatusEquipamento" AS ENUM ('ATIVO', 'EM_MANUTENCAO', 'EMPRESTADO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "StatusManutencao" AS ENUM ('PENDENTE_APROVACAO', 'NEGADA', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'EM_EXECUCAO', 'AGUARDANDO_RETORNO', 'CONCLUIDA', 'BAIXADO');

-- CreateEnum
CREATE TYPE "TipoSolicitacao" AS ENUM ('NOVO_ITEM', 'CESSAO_USO', 'EMPRESTIMO', 'RECOLHA');

-- CreateEnum
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE_APROVACAO', 'NEGADA', 'APROVADA', 'APROVADA_AGUARDANDO_ATA', 'AGUARDANDO_SAIDA', 'AGUARDANDO_RECEBIMENTO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_ENTREGA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMovimentacao" AS ENUM ('CADASTRO', 'IMPORTACAO_CSV', 'ENVIO_MANUTENCAO', 'RETORNO_MANUTENCAO', 'BAIXA', 'CESSAO_USO', 'EMPRESTIMO', 'DEVOLUCAO_EMPRESTIMO', 'RECOLHA', 'DESPACHO_GALPAO', 'RECEBIMENTO_GALPAO', 'ATUALIZACAO_CADASTRO');

-- CreateEnum
CREATE TYPE "OrigemRecurso" AS ENUM ('REGULAR', 'EMENDA_PARLAMENTAR');

-- CreateEnum
CREATE TYPE "StatusNotificacao" AS ENUM ('ENVIADA', 'FALHA', 'REGISTRADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "unidade_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoUnidade" NOT NULL,
    "endereco" TEXT,
    "email_base" TEXT,
    "responsavel" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_equipamento" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamento" (
    "id" TEXT NOT NULL,
    "tombamento" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo_equipamento_id" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "unidade_temporaria_id" TEXT,
    "estado_conservacao" "EstadoConservacao" NOT NULL,
    "status" "StatusEquipamento" NOT NULL DEFAULT 'ATIVO',
    "emenda_parlamentar" BOOLEAN NOT NULL DEFAULT false,
    "data_aquisicao" TIMESTAMP(3),
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacao" (
    "id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "tipo" "TipoMovimentacao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade_origem_id" TEXT,
    "unidade_destino_id" TEXT,
    "usuario_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manutencao" (
    "id" TEXT NOT NULL,
    "equipamento_id" TEXT NOT NULL,
    "unidade_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "descricao_problema" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" "StatusManutencao" NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "motivo_negacao" TEXT,
    "decidido_por_id" TEXT,
    "contrato_id" TEXT,
    "orcamento_valor" DECIMAL(12,2),
    "orcamento_descricao" TEXT,
    "laudo_baixa" TEXT,
    "confirmado_unidade" BOOLEAN NOT NULL DEFAULT false,
    "confirmado_gestor" BOOLEAN NOT NULL DEFAULT false,
    "estado_pos_manutencao" "EstadoConservacao",
    "custo_final" DECIMAL(12,2),
    "data_envio" TIMESTAMP(3),
    "data_conclusao" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manutencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSolicitacao" NOT NULL,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE_APROVACAO',
    "unidade_origem_id" TEXT NOT NULL,
    "unidade_destino_id" TEXT,
    "equipamento_id" TEXT,
    "tipo_equipamento_id" TEXT,
    "quantidade" INTEGER,
    "justificativa" TEXT NOT NULL,
    "origem_recurso" "OrigemRecurso",
    "ata_id" TEXT,
    "valor_vinculado" DECIMAL(12,2),
    "motivo_negacao" TEXT,
    "data_retorno_prevista" TIMESTAMP(3),
    "estado_recebimento" "EstadoConservacao",
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "criado_por_id" TEXT,
    "decidido_por_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato" (
    "id" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "vigencia_inicio" TIMESTAMP(3) NOT NULL,
    "vigencia_fim" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ata" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor_total" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque_galpao" (
    "id" TEXT NOT NULL,
    "tipo_equipamento_id" TEXT NOT NULL,
    "quantidade_interna" INTEGER NOT NULL DEFAULT 0,
    "quantidade_branet" INTEGER NOT NULL DEFAULT 0,
    "reservado" INTEGER NOT NULL DEFAULT 0,
    "ultima_entrada_em" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estoque_galpao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "dados_antes" JSONB,
    "dados_depois" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "status" "StatusNotificacao" NOT NULL,
    "erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_matricula_key" ON "usuario"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "unidade_nome_key" ON "unidade"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nome_key" ON "categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_equipamento_codigo_key" ON "tipo_equipamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "equipamento_tombamento_key" ON "equipamento"("tombamento");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_cnpj_key" ON "contrato"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "ata_numero_key" ON "ata"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "estoque_galpao_tipo_equipamento_id_key" ON "estoque_galpao"("tipo_equipamento_id");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipo_equipamento" ADD CONSTRAINT "tipo_equipamento_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_tipo_equipamento_id_fkey" FOREIGN KEY ("tipo_equipamento_id") REFERENCES "tipo_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_unidade_temporaria_id_fkey" FOREIGN KEY ("unidade_temporaria_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao" ADD CONSTRAINT "movimentacao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao" ADD CONSTRAINT "movimentacao_unidade_origem_id_fkey" FOREIGN KEY ("unidade_origem_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao" ADD CONSTRAINT "movimentacao_unidade_destino_id_fkey" FOREIGN KEY ("unidade_destino_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacao" ADD CONSTRAINT "movimentacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manutencao" ADD CONSTRAINT "manutencao_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_unidade_origem_id_fkey" FOREIGN KEY ("unidade_origem_id") REFERENCES "unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_unidade_destino_id_fkey" FOREIGN KEY ("unidade_destino_id") REFERENCES "unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_tipo_equipamento_id_fkey" FOREIGN KEY ("tipo_equipamento_id") REFERENCES "tipo_equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_ata_id_fkey" FOREIGN KEY ("ata_id") REFERENCES "ata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacao" ADD CONSTRAINT "solicitacao_decidido_por_id_fkey" FOREIGN KEY ("decidido_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque_galpao" ADD CONSTRAINT "estoque_galpao_tipo_equipamento_id_fkey" FOREIGN KEY ("tipo_equipamento_id") REFERENCES "tipo_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
