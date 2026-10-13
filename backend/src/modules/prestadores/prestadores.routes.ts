import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Prestadores de serviço (empresas contratadas). Cadastro em Configurações (Administrador).
export const prestadoresRouter = Router();

prestadoresRouter.use(autenticar);

prestadoresRouter.get('/', permitir(Perfil.OPERADOR), async (_req, res) => {
  const prestadores = await prisma.prestadorServico.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { contratos: true } } },
  });
  res.json(prestadores);
});

const prestadorSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  cnpj: z.string().trim().min(11).max(18).nullable().optional(),
  telefone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional(),
});

async function validarUnicos(dados: { nome?: string; cnpj?: string | null }, atualId?: string) {
  if (dados.nome) {
    const nome = await prisma.prestadorServico.findUnique({ where: { nome: dados.nome } });
    if (nome && nome.id !== atualId) throw new AppError('Já existe prestador com este nome.', 409);
  }
  if (dados.cnpj) {
    const cnpj = await prisma.prestadorServico.findUnique({ where: { cnpj: dados.cnpj } });
    if (cnpj && cnpj.id !== atualId) throw new AppError('Já existe prestador com este CNPJ.', 409);
  }
}

prestadoresRouter.post(
  '/',
  permitir(Perfil.OPERADOR),
  validarBody(prestadorSchema),
  async (req, res) => {
    await validarUnicos(req.body);
    const prestador = await prisma.prestadorServico.create({ data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'CADASTRAR_PRESTADOR',
      entidade: 'prestador_servico',
      entidadeId: prestador.id,
      dadosDepois: { nome: prestador.nome },
    });
    res.status(201).json(prestador);
  },
);

prestadoresRouter.patch(
  '/:id',
  permitir(Perfil.OPERADOR),
  validarBody(prestadorSchema.partial()),
  async (req, res) => {
    const antes = await prisma.prestadorServico.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Prestador não encontrado.', 404);
    await validarUnicos(req.body, antes.id);
    const prestador = await prisma.prestadorServico.update({ where: { id: antes.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_PRESTADOR',
      entidade: 'prestador_servico',
      entidadeId: prestador.id,
      dadosAntes: { nome: antes.nome, cnpj: antes.cnpj },
      dadosDepois: req.body,
    });
    res.json(prestador);
  },
);

prestadoresRouter.delete('/:id', permitir(Perfil.OPERADOR), async (req, res) => {
  const prestador = await prisma.prestadorServico.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { contratos: true } } },
  });
  if (!prestador) throw new AppError('Prestador não encontrado.', 404);
  if (prestador._count.contratos > 0) {
    throw new AppError('O prestador possui contratos vinculados e não pode ser excluído.', 422);
  }
  await prisma.prestadorServico.delete({ where: { id: prestador.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_PRESTADOR',
    entidade: 'prestador_servico',
    entidadeId: prestador.id,
    dadosAntes: { nome: prestador.nome },
  });
  res.status(204).end();
});
