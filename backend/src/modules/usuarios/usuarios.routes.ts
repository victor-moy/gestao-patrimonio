import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// RF02 — o administrador (Gestor de Patrimônio) cadastra usuários
// e atribui perfis. Inclui matrícula funcional (feedback 12/05/2026).
export const usuariosRouter = Router();

usuariosRouter.use(autenticar, permitir(Perfil.GESTOR_PATRIMONIO));

const usuarioSelect = {
  id: true,
  nome: true,
  email: true,
  matricula: true,
  perfil: true,
  ativo: true,
  unidadeId: true,
  unidade: { select: { nome: true } },
  criadoEm: true,
};

usuariosRouter.get('/', async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: usuarioSelect,
    orderBy: { nome: 'asc' },
  });
  res.json(usuarios);
});

const criarSchema = z.object({
  nome: z.string().min(3),
  email: z.string().email(),
  matricula: z.string().min(1),
  senha: z.string().min(6, 'a senha deve ter no mínimo 6 caracteres'),
  perfil: z.nativeEnum(Perfil),
  unidadeId: z.string().uuid().nullable().optional(),
});

usuariosRouter.post('/', validarBody(criarSchema), async (req, res) => {
  const { nome, email, matricula, senha, perfil, unidadeId } = req.body;
  const jaExiste = await prisma.usuario.findFirst({
    where: { OR: [{ email }, { matricula }] },
  });
  if (jaExiste) {
    throw new AppError('Já existe usuário com este e-mail ou matrícula.', 409);
  }
  if ((perfil === Perfil.UNIDADE || perfil === Perfil.GALPAO) && !unidadeId) {
    throw new AppError('Usuários de unidade ou galpão devem estar vinculados a uma unidade.', 422);
  }
  const usuario = await prisma.usuario.create({
    data: {
      nome,
      email,
      matricula,
      perfil,
      unidadeId: unidadeId ?? null,
      senhaHash: await bcrypt.hash(senha, 10),
    },
    select: usuarioSelect,
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'CRIAR_USUARIO',
    entidade: 'usuario',
    entidadeId: usuario.id,
    dadosDepois: usuario,
  });
  res.status(201).json(usuario);
});

const atualizarSchema = z.object({
  nome: z.string().min(3).optional(),
  perfil: z.nativeEnum(Perfil).optional(),
  unidadeId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(6).optional(),
});

usuariosRouter.patch('/:id', validarBody(atualizarSchema), async (req, res) => {
  const antes = await prisma.usuario.findUnique({
    where: { id: req.params.id },
    select: usuarioSelect,
  });
  if (!antes) throw new AppError('Usuário não encontrado.', 404);
  const { senha, ...dados } = req.body;

  // Responsável por unidade não pode ser desativado nem transferido —
  // primeiro é preciso definir outro responsável para a unidade.
  const desativando = dados.ativo === false && antes.ativo !== false;
  const mudandoUnidade = dados.unidadeId !== undefined && dados.unidadeId !== antes.unidadeId;
  if (desativando || mudandoUnidade) {
    const unidadeResponsavel = await prisma.unidade.findFirst({
      where: { responsavelId: req.params.id },
      select: { nome: true },
    });
    if (unidadeResponsavel) {
      throw new AppError(
        `O usuário é responsável pela unidade ${unidadeResponsavel.nome} e não pode ser ${desativando ? 'desativado' : 'transferido de unidade'}. Defina outro responsável para a unidade antes.`,
        422,
      );
    }
  }
  const usuario = await prisma.usuario.update({
    where: { id: req.params.id },
    data: {
      ...dados,
      ...(senha ? { senhaHash: await bcrypt.hash(senha, 10) } : {}),
    },
    select: usuarioSelect,
  });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'ATUALIZAR_USUARIO',
    entidade: 'usuario',
    entidadeId: usuario.id,
    dadosAntes: antes,
    dadosDepois: usuario,
  });
  res.json(usuario);
});
