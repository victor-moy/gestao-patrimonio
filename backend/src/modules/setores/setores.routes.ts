import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { Perfil } from '@prisma/client';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Setores de cada unidade (ex.: Recepção, Farmácia). Cadastro em Configurações; o avaliador técnico escolhe o setor do chamado.
export const setoresRouter = Router();

setoresRouter.use(autenticar);

const select = { id: true, nome: true, ativo: true, unidadeId: true, unidade: { select: { id: true, nome: true } } } as const;

// A lista também serve a quem avalia chamados, para escolher o setor
setoresRouter.get(
  '/',
  permitirCom(['CONFIGURACOES_GERENCIAR', 'MANUTENCAO_AVALIAR', 'MANUTENCAO_ESCREVER'], Perfil.UNIDADE),
  async (req, res) => {
    // A Unidade só vê os setores ativos da própria unidade (vem do token, nunca da query)
    const daUnidade = req.usuario!.perfil === Perfil.UNIDADE;
    const unidadeId = daUnidade ? (req.usuario!.unidadeId ?? '') : typeof req.query.unidadeId === 'string' ? req.query.unidadeId : undefined;
    res.json(
      await prisma.setor.findMany({
        where: { ...(unidadeId !== undefined ? { unidadeId } : {}), ...(daUnidade ? { ativo: true } : {}) },
        orderBy: [{ unidade: { nome: 'asc' } }, { nome: 'asc' }],
        select: { ...select, _count: { select: { manutencoes: true } } },
        take: 1000,
      }),
    );
  },
);

const setorSchema = z.object({
  nome: z.string().trim().min(2, 'informe o nome do setor').max(80),
  unidadeId: z.string().uuid('selecione a unidade'),
  ativo: z.boolean().optional(),
});

async function validar(dados: { nome?: string; unidadeId?: string }, atual?: { id: string; nome: string; unidadeId: string }) {
  const unidadeId = dados.unidadeId ?? atual?.unidadeId;
  const nome = dados.nome ?? atual?.nome;
  if (dados.unidadeId && !(await prisma.unidade.findUnique({ where: { id: dados.unidadeId }, select: { id: true } }))) {
    throw new AppError('Unidade não encontrada.', 422);
  }
  if (!unidadeId || !nome) return;
  const igual = await prisma.setor.findUnique({ where: { unidadeId_nome: { unidadeId, nome } } });
  if (igual && igual.id !== atual?.id) throw new AppError('Já existe setor com este nome nesta unidade.', 409);
}

setoresRouter.post('/', permitirCom('CONFIGURACOES_GERENCIAR'), validarBody(setorSchema), async (req, res) => {
  await validar(req.body);
  const setor = await prisma.setor.create({ data: req.body, select });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'CADASTRAR_SETOR',
    entidade: 'setor',
    entidadeId: setor.id,
    dadosDepois: { nome: setor.nome, unidadeId: setor.unidadeId },
  });
  res.status(201).json(setor);
});

setoresRouter.patch('/:id', permitirCom('CONFIGURACOES_GERENCIAR'), validarBody(setorSchema.partial()), async (req, res) => {
  const antes = await prisma.setor.findUnique({ where: { id: req.params.id } });
  if (!antes) throw new AppError('Setor não encontrado.', 404);
  await validar(req.body, antes);
  const setor = await prisma.setor.update({ where: { id: antes.id }, data: req.body, select });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'ATUALIZAR_SETOR',
    entidade: 'setor',
    entidadeId: setor.id,
    dadosAntes: { nome: antes.nome, unidadeId: antes.unidadeId, ativo: antes.ativo },
    dadosDepois: req.body,
  });
  res.json(setor);
});

setoresRouter.delete('/:id', permitirCom('CONFIGURACOES_GERENCIAR'), async (req, res) => {
  const setor = await prisma.setor.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { manutencoes: true } } },
  });
  if (!setor) throw new AppError('Setor não encontrado.', 404);
  if (setor._count.manutencoes > 0) {
    throw new AppError('O setor está em chamados e não pode ser excluído. Desative-o.', 422);
  }
  await prisma.setor.delete({ where: { id: setor.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_SETOR',
    entidade: 'setor',
    entidadeId: setor.id,
    dadosAntes: { nome: setor.nome },
  });
  res.status(204).end();
});
