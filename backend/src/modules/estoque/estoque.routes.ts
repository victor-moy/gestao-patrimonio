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
import { limiteImportacao } from '../importacao/importacao.routes';
import { env } from '../../config/env';
import { importarEstoqueCsv } from './estoque.importacao.service';

export const estoqueRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

estoqueRouter.use(autenticar, permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO));

// Resolve o galpão-alvo da operação. O usuário GALPAO só opera o próprio galpão
// (qualquer unidadeId enviado no corpo é ignorado); o Gestor de Patrimônio, que
// não pertence a um galpão, precisa informar qual no corpo.
function resolverGalpaoId(req: Request): string {
  const usuario = req.usuario!;
  const unidadeId =
    usuario.perfil === Perfil.GALPAO ? usuario.unidadeId : (req.body?.unidadeId as string | undefined);
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
estoqueRouter.post(
  '/importar-csv',
  (req, res, next) => (env.rateLimitAtivo ? limiteImportacao(req, res, next) : next()),
  upload.single('arquivo'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('Envie o arquivo CSV no campo "arquivo".', 422);
    }
    const unidadeId = resolverGalpaoId(req);
    await validarGalpao(unidadeId);
    const resultado = await importarEstoqueCsv(req.usuario!.sub, req.file.buffer, unidadeId);
    res.json(resultado);
  },
);

// Tipos que reservam do estoque de galpão (Ampliação/Substituição sem ata) —
// mesmo conjunto usado em solicitacoes.service.ts
const TIPOS_COM_ATA = ['AMPLIACAO', 'SUBSTITUICAO'] as const;

// Quanto de cada tipo de equipamento está comprometido com solicitações já
// aprovadas (Reservado/Aguardando Entrega/Aguardando Validação, sem ata —
// ou seja, veio do próprio estoque). Não é por galpão específico porque a
// reserva não guarda qual galpão forneceu o item, só decrementa a quantidade
// na hora — então o total só faz sentido agregado entre todos os galpões.
async function calcularReservadoPorTipo(tipoEquipamentoIds: string[]) {
  if (tipoEquipamentoIds.length === 0) return new Map<string, number>();
  const grupos = await prisma.solicitacao.groupBy({
    by: ['tipoEquipamentoId'],
    where: {
      tipoEquipamentoId: { in: tipoEquipamentoIds },
      status: { in: ['RESERVADO', 'AGUARDANDO_ENTREGA', 'AGUARDANDO_VALIDACAO'] },
      ataId: null,
      tipo: { in: [...TIPOS_COM_ATA] },
    },
    _sum: { quantidade: true },
  });
  return new Map(grupos.map((g) => [g.tipoEquipamentoId as string, g._sum.quantidade ?? 0]));
}

estoqueRouter.get('/', async (req, res) => {
  // Galpão enxerga apenas o próprio estoque; o Gestor pode filtrar por qualquer galpão.
  const unidadeId =
    req.usuario!.perfil === Perfil.GALPAO ? (req.usuario!.unidadeId ?? '') : (req.query.unidadeId as string | undefined);
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
  // Reaproveita o campo `reservado` do schema (existe mas nunca era escrito)
  // — calculado por consulta, não por incremento/decremento manual, porque
  // a reserva não guarda qual EstoqueGalpao a atendeu (ver função acima).
  const reservadoPorTipo = await calcularReservadoPorTipo(itens.map((i) => i.tipoEquipamentoId));
  res.json(itens.map((i) => ({ ...i, reservado: reservadoPorTipo.get(i.tipoEquipamentoId) ?? 0 })));
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
  });
  if (!item) throw new AppError('Item não encontrado no estoque deste galpão.', 404);
  const atualizado = await prisma.$transaction(async (tx) => {
    // Débito condicional: duas saídas simultâneas nunca deixam o estoque negativo.
    const { count } = await tx.estoqueGalpao.updateMany({
      where: { id: item.id, quantidade: { gte: quantidade } },
      data: { quantidade: { decrement: quantidade } },
    });
    if (count !== 1) {
      const atual = await tx.estoqueGalpao.findUnique({ where: { id: item.id } });
      throw new AppError(`Quantidade indisponível no estoque (disponível: ${atual?.quantidade ?? 0}).`, 422);
    }
    await tx.movimentacaoEstoque.create({
      data: {
        estoqueId: item.id,
        tipo: 'SAIDA',
        quantidade,
        unidadeDestinoId: unidadeDestinoId ?? null,
        usuarioId: req.usuario!.sub,
      },
    });
    return tx.estoqueGalpao.findUniqueOrThrow({ where: { id: item.id } });
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
