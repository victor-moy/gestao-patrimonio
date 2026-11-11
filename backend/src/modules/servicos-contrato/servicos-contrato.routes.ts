import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Catálogo de serviços que compõem os contratos (ex.: "Serviço de manutenção preventiva e corretiva").
// Cadastro em Configurações (Administrador).
export const servicosContratoRouter = Router();

servicosContratoRouter.use(autenticar);

servicosContratoRouter.get('/', permitirCom('CONTRATOS_GERENCIAR'), async (_req, res) => {
  const servicos = await prisma.servicoContrato.findMany({
    orderBy: { nome: 'asc' },
    include: { _count: { select: { itens: true } } },
  });
  res.json(servicos);
});

const servicoSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(500).nullable().optional(),
  exigeAvaliacaoTecnica: z.boolean().optional(),
  exigeOrcamentoPrevio: z.boolean().optional(),
});

async function validarNome(nome: string | undefined, atualId?: string) {
  if (!nome) return;
  const existe = await prisma.servicoContrato.findUnique({ where: { nome } });
  if (existe && existe.id !== atualId) throw new AppError('Já existe serviço com este nome.', 409);
}

servicosContratoRouter.post(
  '/',
  permitirCom('CONTRATOS_GERENCIAR'),
  validarBody(servicoSchema),
  async (req, res) => {
    await validarNome(req.body.nome);
    const servico = await prisma.servicoContrato.create({ data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'CADASTRAR_SERVICO_CONTRATO',
      entidade: 'servico_contrato',
      entidadeId: servico.id,
      dadosDepois: { nome: servico.nome, exigeAvaliacaoTecnica: servico.exigeAvaliacaoTecnica, exigeOrcamentoPrevio: servico.exigeOrcamentoPrevio },
    });
    res.status(201).json(servico);
  },
);

servicosContratoRouter.patch(
  '/:id',
  permitirCom('CONTRATOS_GERENCIAR'),
  validarBody(servicoSchema.partial()),
  async (req, res) => {
    const antes = await prisma.servicoContrato.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Serviço não encontrado.', 404);
    await validarNome(req.body.nome, antes.id);
    const servico = await prisma.servicoContrato.update({ where: { id: antes.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_SERVICO_CONTRATO',
      entidade: 'servico_contrato',
      entidadeId: servico.id,
      dadosAntes: { nome: antes.nome, exigeAvaliacaoTecnica: antes.exigeAvaliacaoTecnica, exigeOrcamentoPrevio: antes.exigeOrcamentoPrevio },
      dadosDepois: req.body,
    });
    res.json(servico);
  },
);

servicosContratoRouter.delete('/:id', permitirCom('CONTRATOS_GERENCIAR'), async (req, res) => {
  const servico = await prisma.servicoContrato.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { itens: true } } },
  });
  if (!servico) throw new AppError('Serviço não encontrado.', 404);
  if (servico._count.itens > 0) {
    throw new AppError('O serviço está em uso por contratos e não pode ser excluído.', 422);
  }
  await prisma.servicoContrato.delete({ where: { id: servico.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_SERVICO_CONTRATO',
    entidade: 'servico_contrato',
    entidadeId: servico.id,
    dadosAntes: { nome: servico.nome },
  });
  res.status(204).end();
});
