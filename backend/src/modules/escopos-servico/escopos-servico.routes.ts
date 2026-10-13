import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Escopos dos serviços contratados (ex.: "Preventiva", "Corretiva").
// Cadastro em Configurações (Administrador).
export const escoposServicoRouter = Router();

escoposServicoRouter.use(autenticar);

escoposServicoRouter.get('/', permitir(Perfil.OPERADOR), async (_req, res) => {
  const escopos = await prisma.escopoServico.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { itens: true } } },
  });
  res.json(escopos);
});

const escopoSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(500).nullable().optional(),
  cobrePreventiva: z.boolean().default(true),
  cobreCorretiva: z.boolean().default(true),
});

const MSG_COBERTURA = 'o escopo precisa cobrir manutenção preventiva, corretiva ou ambas';

async function validarNome(nome: string | undefined, atualId?: string) {
  if (!nome) return;
  const existe = await prisma.escopoServico.findUnique({ where: { nome } });
  if (existe && existe.id !== atualId) throw new AppError('Já existe escopo com este nome.', 409);
}

escoposServicoRouter.post(
  '/',
  permitir(Perfil.OPERADOR),
  validarBody(escopoSchema),
  async (req, res) => {
    if (!req.body.cobrePreventiva && !req.body.cobreCorretiva) throw new AppError(MSG_COBERTURA, 422);
    await validarNome(req.body.nome);
    const escopo = await prisma.escopoServico.create({ data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'CADASTRAR_ESCOPO_SERVICO',
      entidade: 'escopo_escopo',
      entidadeId: escopo.id,
      dadosDepois: { nome: escopo.nome },
    });
    res.status(201).json(escopo);
  },
);

escoposServicoRouter.patch(
  '/:id',
  permitir(Perfil.OPERADOR),
  validarBody(escopoSchema.partial().extend({ cobrePreventiva: z.boolean().optional(), cobreCorretiva: z.boolean().optional() })),
  async (req, res) => {
    const antes = await prisma.escopoServico.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Escopo não encontrado.', 404);
    const preventiva = req.body.cobrePreventiva ?? antes.cobrePreventiva;
    const corretiva = req.body.cobreCorretiva ?? antes.cobreCorretiva;
    if (!preventiva && !corretiva) throw new AppError(MSG_COBERTURA, 422);
    await validarNome(req.body.nome, antes.id);
    const escopo = await prisma.escopoServico.update({ where: { id: antes.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_ESCOPO_SERVICO',
      entidade: 'escopo_escopo',
      entidadeId: escopo.id,
      dadosAntes: { nome: antes.nome },
      dadosDepois: req.body,
    });
    res.json(escopo);
  },
);

escoposServicoRouter.delete('/:id', permitir(Perfil.OPERADOR), async (req, res) => {
  const escopo = await prisma.escopoServico.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { itens: true } } },
  });
  if (!escopo) throw new AppError('Escopo não encontrado.', 404);
  if (escopo._count.itens > 0) {
    throw new AppError('O escopo está em uso por contratos e não pode ser excluído.', 422);
  }
  await prisma.escopoServico.delete({ where: { id: escopo.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_ESCOPO_SERVICO',
    entidade: 'escopo_escopo',
    entidadeId: escopo.id,
    dadosAntes: { nome: escopo.nome },
  });
  res.status(204).end();
});
