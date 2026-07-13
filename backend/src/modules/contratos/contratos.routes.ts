import { Router } from 'express';
import { z } from 'zod';
import { Perfil, StatusContrato } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Contratos de manutenção, garantia e serviços (Configurações do Sistema)
export const contratosRouter = Router();

contratosRouter.use(autenticar, permitir(Perfil.GESTOR_MANUTENCAO, Perfil.GESTOR_PATRIMONIO));

contratosRouter.get('/', async (req, res) => {
  const busca = req.query.busca as string | undefined;
  const contratos = await prisma.contrato.findMany({
    where: busca
      ? {
          OR: [
            { numero: { contains: busca, mode: 'insensitive' } },
            { empresa: { contains: busca, mode: 'insensitive' } },
            { tipo: { contains: busca, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { numero: 'asc' },
  });
  res.json(contratos);
});

const contratoSchema = z.object({
  numero: z.string().min(1),
  empresa: z.string().min(2),
  cnpj: z.string().min(11).nullable().optional(),
  tipo: z.string().min(2),
  objeto: z.string().min(2),
  valorTotal: z.number().nonnegative().nullable().optional(),
  condicoesPagamento: z.string().nullable().optional(),
  status: z.nativeEnum(StatusContrato).default('ATIVO'),
  observacoes: z.string().nullable().optional(),
  vigenciaInicio: z.coerce.date(),
  vigenciaFim: z.coerce.date(),
});

contratosRouter.post('/', validarBody(contratoSchema), async (req, res) => {
  const existe = await prisma.contrato.findUnique({ where: { numero: req.body.numero } });
  if (existe) throw new AppError('Já existe contrato com este número.', 409);
  if (req.body.cnpj) {
    const cnpjExiste = await prisma.contrato.findUnique({ where: { cnpj: req.body.cnpj } });
    if (cnpjExiste) throw new AppError('Já existe contrato com este CNPJ.', 409);
  }
  const contrato = await prisma.contrato.create({ data: req.body });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'CADASTRAR_CONTRATO',
    entidade: 'contrato',
    entidadeId: contrato.id,
    dadosDepois: { numero: contrato.numero, empresa: contrato.empresa },
  });
  res.status(201).json(contrato);
});

contratosRouter.patch(
  '/:id',
  validarBody(contratoSchema.partial().extend({ ativo: z.boolean().optional() })),
  async (req, res) => {
    const antes = await prisma.contrato.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Contrato não encontrado.', 404);
    if (req.body.numero && req.body.numero !== antes.numero) {
      const duplicado = await prisma.contrato.findUnique({ where: { numero: req.body.numero } });
      if (duplicado) throw new AppError('Já existe contrato com este número.', 409);
    }
    const contrato = await prisma.contrato.update({ where: { id: req.params.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_CONTRATO',
      entidade: 'contrato',
      entidadeId: contrato.id,
      dadosAntes: { numero: antes.numero, status: antes.status },
      dadosDepois: req.body,
    });
    res.json(contrato);
  },
);

contratosRouter.delete('/:id', permitir(Perfil.GESTOR_PATRIMONIO), async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { manutencoes: true } } },
  });
  if (!contrato) throw new AppError('Contrato não encontrado.', 404);
  if (contrato._count.manutencoes > 0) {
    throw new AppError(
      'O contrato possui manutenções vinculadas e não pode ser excluído. Marque-o como expirado.',
      422,
    );
  }
  await prisma.contrato.delete({ where: { id: req.params.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_CONTRATO',
    entidade: 'contrato',
    entidadeId: contrato.id,
    dadosAntes: { numero: contrato.numero, empresa: contrato.empresa },
  });
  res.status(204).end();
});
