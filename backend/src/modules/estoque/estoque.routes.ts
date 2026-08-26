import { Request, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { importarEstoqueCsv } from './estoque.importacao.service';

export const estoqueRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

estoqueRouter.use(autenticar, permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO));

// Resolve o galpão-alvo da operação: explícito no corpo (usado pelo Gestor de
// Patrimônio, que não pertence a um galpão específico) ou a própria unidade
// do usuário GALPAO logado.
function resolverGalpaoId(req: Request): string {
  const unidadeId = (req.body?.unidadeId as string | undefined) ?? req.usuario!.unidadeId ?? undefined;
  if (!unidadeId) {
    throw new AppError('Informe o galpão (unidadeId) da operação.', 422);
  }
  return unidadeId;
}

async function validarGalpao(unidadeId: string) {
  const galpao = await prisma.unidade.findUnique({ where: { id: unidadeId } });
  if (!galpao || galpao.tipo !== 'GALPAO') {
    throw new AppError('unidadeId deve ser uma unidade do tipo galpão.', 422);
  }
  return galpao;
}

// Importação do relatório de estoque consolidado (Branet) — cria/atualiza
// tipos de equipamento e saldo de estoque em lote, para um galpão específico
estoqueRouter.post('/importar-csv', upload.single('arquivo'), async (req, res) => {
  if (!req.file) {
    throw new AppError('Envie o arquivo CSV no campo "arquivo".', 422);
  }
  const unidadeId = resolverGalpaoId(req);
  await validarGalpao(unidadeId);
  const resultado = await importarEstoqueCsv(req.usuario!.sub, req.file.buffer, unidadeId);
  res.json(resultado);
});

estoqueRouter.get('/', async (req, res) => {
  const unidadeId = req.query.unidadeId as string | undefined;
  const itens = await prisma.estoqueGalpao.findMany({
    where: unidadeId ? { unidadeId } : undefined,
    include: {
      tipoEquipamento: {
        include: { categoria: { select: { nome: true, cor: true } } },
      },
      unidade: { select: { id: true, nome: true } },
    },
    orderBy: { tipoEquipamento: { nome: 'asc' } },
  });
  res.json(itens);
});

estoqueRouter.get('/movimentacoes', async (_req, res) => {
  const movimentacoes = await prisma.movimentacaoEstoque.findMany({
    include: {
      estoque: {
        include: { tipoEquipamento: true },
      },
      unidadeDestino: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  });
  res.json(movimentacoes);
});

estoqueRouter.patch('/movimentacoes/:id', async (req, res) => {
  const mov = await prisma.movimentacaoEstoque.findUnique({ where: { id: req.params.id } });
  if (!mov) throw new AppError('Movimentação não encontrada.', 404);
  const atualizado = await prisma.movimentacaoEstoque.update({
    where: { id: req.params.id },
    data: { atualizadoNoBranet: !mov.atualizadoNoBranet },
    include: {
      estoque: { include: { tipoEquipamento: true } },
      unidadeDestino: { select: { id: true, nome: true } },
      usuario: { select: { id: true, nome: true } },
    },
  });
  res.json(atualizado);
});

const entradaSchema = z.object({
  tipoEquipamentoId: z.string().uuid(),
  quantidade: z.number().int().positive(),
  unidadeId: z.string().uuid().optional(),
});

estoqueRouter.post('/entrada', validarBody(entradaSchema), async (req, res) => {
  const { tipoEquipamentoId, quantidade } = req.body;
  const unidadeId = resolverGalpaoId(req);
  await validarGalpao(unidadeId);
  const tipo = await prisma.tipoEquipamento.findUnique({ where: { id: tipoEquipamentoId } });
  if (!tipo) throw new AppError('Tipo de equipamento não encontrado.', 404);
  const item = await prisma.$transaction(async (tx) => {
    const estoque = await tx.estoqueGalpao.upsert({
      where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId, unidadeId } },
      create: { tipoEquipamentoId, unidadeId, quantidade, ultimaEntradaEm: new Date() },
      update: { quantidade: { increment: quantidade }, ultimaEntradaEm: new Date() },
    });
    await tx.movimentacaoEstoque.create({
      data: {
        estoqueId: estoque.id,
        tipo: 'ENTRADA',
        quantidade,
        usuarioId: req.usuario!.sub,
      },
    });
    return estoque;
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'ENTRADA_ESTOQUE',
    entidade: 'estoque_galpao',
    entidadeId: item.id,
    dadosDepois: { tipoEquipamentoId, unidadeId, quantidade },
  });
  res.json(item);
});

const saidaSchema = z.object({
  tipoEquipamentoId: z.string().uuid(),
  quantidade: z.number().int().positive(),
  unidadeDestinoId: z.string().uuid(),
  unidadeId: z.string().uuid().optional(),
});

estoqueRouter.post('/saida', validarBody(saidaSchema), async (req, res) => {
  const { tipoEquipamentoId, quantidade, unidadeDestinoId } = req.body;
  const unidadeId = resolverGalpaoId(req);
  const item = await prisma.estoqueGalpao.findUnique({
    where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId, unidadeId } },
    include: { tipoEquipamento: true },
  });
  if (!item) throw new AppError('Item não encontrado no estoque deste galpão.', 404);
  if (item.quantidade < quantidade) {
    throw new AppError(`Quantidade indisponível no estoque (disponível: ${item.quantidade}).`, 422);
  }
  const atualizado = await prisma.$transaction(async (tx) => {
    const estoque = await tx.estoqueGalpao.update({
      where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId, unidadeId } },
      data: { quantidade: { decrement: quantidade } },
    });
    await tx.movimentacaoEstoque.create({
      data: {
        estoqueId: estoque.id,
        tipo: 'SAIDA',
        quantidade,
        unidadeDestinoId: unidadeDestinoId ?? null,
        usuarioId: req.usuario!.sub,
      },
    });
    return estoque;
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'SAIDA_ESTOQUE',
    entidade: 'estoque_galpao',
    entidadeId: item.id,
    dadosDepois: { tipoEquipamentoId, unidadeId, quantidade, unidadeDestinoId: unidadeDestinoId ?? null },
  });
  res.json(atualizado);
});
