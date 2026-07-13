import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

export const estoqueRouter = Router();

estoqueRouter.use(autenticar, permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO));

estoqueRouter.get('/', async (_req, res) => {
  const itens = await prisma.estoqueGalpao.findMany({
    include: {
      tipoEquipamento: {
        include: { categoria: { select: { nome: true } } },
      },
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
});

estoqueRouter.post('/entrada', validarBody(entradaSchema), async (req, res) => {
  const { tipoEquipamentoId, quantidade } = req.body;
  const tipo = await prisma.tipoEquipamento.findUnique({ where: { id: tipoEquipamentoId } });
  if (!tipo) throw new AppError('Tipo de equipamento não encontrado.', 404);
  const item = await prisma.$transaction(async (tx) => {
    const estoque = await tx.estoqueGalpao.upsert({
      where: { tipoEquipamentoId },
      create: { tipoEquipamentoId, quantidade, ultimaEntradaEm: new Date() },
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
    dadosDepois: { tipoEquipamentoId, quantidade },
  });
  res.json(item);
});

const saidaSchema = z.object({
  tipoEquipamentoId: z.string().uuid(),
  quantidade: z.number().int().positive(),
  unidadeDestinoId: z.string().uuid(),
});

estoqueRouter.post('/saida', validarBody(saidaSchema), async (req, res) => {
  const { tipoEquipamentoId, quantidade, unidadeDestinoId } = req.body;
  const item = await prisma.estoqueGalpao.findUnique({
    where: { tipoEquipamentoId },
    include: { tipoEquipamento: true },
  });
  if (!item) throw new AppError('Item não encontrado no estoque.', 404);
  if (item.quantidade < quantidade) {
    throw new AppError(`Quantidade indisponível no estoque (disponível: ${item.quantidade}).`, 422);
  }
  const atualizado = await prisma.$transaction(async (tx) => {
    const estoque = await tx.estoqueGalpao.update({
      where: { tipoEquipamentoId },
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
    dadosDepois: { tipoEquipamentoId, quantidade, unidadeDestinoId: unidadeDestinoId ?? null },
  });
  res.json(atualizado);
});
