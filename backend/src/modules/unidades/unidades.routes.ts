import { Router } from 'express';
import { z } from 'zod';
import { Perfil, TipoUnidade } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

export const unidadesRouter = Router();

unidadesRouter.use(autenticar);

// Todas as unidades — usado nos selects de destino de cessão/empréstimo.
// ?incluirInativos=true retorna também as inativas (usado na tela de config).
unidadesRouter.get('/', async (req, res) => {
  const incluirInativos = req.query.incluirInativos === 'true';
  const unidades = await prisma.unidade.findMany({
    where: incluirInativos ? undefined : { ativo: true },
    include: { responsavel: { select: { id: true, nome: true } } },
    orderBy: { nome: 'asc' },
  });
  res.json(unidades);
});

const unidadeSchema = z.object({
  nome: z.string().min(2),
  tipo: z.nativeEnum(TipoUnidade),
  endereco: z.string().nullable().optional(),
  emailBase: z.string().email().nullable().optional(),
  responsavelId: z.string().uuid(),
});

async function buscarUsuarioAtivo(responsavelId: string) {
  const responsavel = await prisma.usuario.findUnique({ where: { id: responsavelId } });
  if (!responsavel || !responsavel.ativo) {
    throw new AppError('O responsável deve ser um usuário ativo do sistema.', 422);
  }
  return responsavel;
}

// Na edição, o responsável deve já estar vinculado à própria unidade
async function validarResponsavel(responsavelId: string, unidadeId: string) {
  const responsavel = await buscarUsuarioAtivo(responsavelId);
  if (responsavel.unidadeId !== unidadeId) {
    throw new AppError('O responsável deve ser um usuário vinculado a esta unidade.', 422);
  }
}

unidadesRouter.post(
  '/',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(unidadeSchema),
  async (req, res) => {
    const existe = await prisma.unidade.findUnique({ where: { nome: req.body.nome } });
    if (existe) throw new AppError('Já existe unidade com este nome.', 409);
    // Na criação o vínculo nasce junto: o responsável selecionado passa a
    // pertencer à nova unidade (a unidade ainda não existia para havê-lo).
    if (req.body.responsavelId) {
      await buscarUsuarioAtivo(req.body.responsavelId);
      const jaResponsavel = await prisma.unidade.findFirst({
        where: { responsavelId: req.body.responsavelId },
        select: { nome: true },
      });
      if (jaResponsavel) {
        throw new AppError(
          `O usuário já é responsável pela unidade ${jaResponsavel.nome} e não pode ser transferido. Defina outro responsável para ela antes.`,
          422,
        );
      }
    }
    const unidade = await prisma.$transaction(async (tx) => {
      const criada = await tx.unidade.create({
        data: req.body,
        include: { responsavel: { select: { id: true, nome: true } } },
      });
      if (req.body.responsavelId) {
        await tx.usuario.update({
          where: { id: req.body.responsavelId },
          data: { unidadeId: criada.id },
        });
      }
      await registrarAuditoria(
        {
          usuarioId: req.usuario!.sub,
          acao: 'CRIAR_UNIDADE',
          entidade: 'unidade',
          entidadeId: criada.id,
          dadosDepois: {
            nome: criada.nome,
            tipo: criada.tipo,
            responsavelId: criada.responsavelId,
            responsavelVinculadoAutomaticamente: Boolean(req.body.responsavelId),
          },
        },
        tx,
      );
      return criada;
    });
    res.status(201).json(unidade);
  },
);

unidadesRouter.patch(
  '/:id',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    unidadeSchema.partial().extend({
      ativo: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const antes = await prisma.unidade.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Unidade não encontrada.', 404);
    if (req.body.responsavelId) {
      await validarResponsavel(req.body.responsavelId, req.params.id);
    }
    const unidade = await prisma.unidade.update({
      where: { id: req.params.id },
      data: req.body,
      include: { responsavel: { select: { id: true, nome: true } } },
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_UNIDADE',
      entidade: 'unidade',
      entidadeId: unidade.id,
      dadosAntes: antes,
      dadosDepois: unidade,
    });
    res.json(unidade);
  },
);

unidadesRouter.delete('/:id', permitir(Perfil.GESTOR_PATRIMONIO), async (req, res) => {
  const unidade = await prisma.unidade.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { equipamentos: true, solicitacoesOrigem: true, manutencoes: true },
      },
    },
  });
  if (!unidade) throw new AppError('Unidade não encontrada.', 404);
  const vinculos = unidade._count;
  if (vinculos.equipamentos > 0 || vinculos.solicitacoesOrigem > 0 || vinculos.manutencoes > 0) {
    throw new AppError(
      'A unidade possui equipamentos ou movimentações vinculados e não pode ser excluída. Desative-a em vez disso.',
      422,
    );
  }
  await prisma.$transaction(async (tx) => {
    // Desvincula usuários e responsável antes de deletar
    await tx.usuario.updateMany({ where: { unidadeId: req.params.id }, data: { unidadeId: null } });
    await tx.unidade.delete({ where: { id: req.params.id } });
    await registrarAuditoria(
      {
        usuarioId: req.usuario!.sub,
        acao: 'EXCLUIR_UNIDADE',
        entidade: 'unidade',
        entidadeId: unidade.id,
        dadosAntes: { nome: unidade.nome, tipo: unidade.tipo },
      },
      tx,
    );
  });
  res.status(204).end();
});
