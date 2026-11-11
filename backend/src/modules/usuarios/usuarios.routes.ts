import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { Permissao, TODAS_PERMISSOES } from '../../lib/permissoes';
import { confirmarAdministradorNoBanco } from './administrador';

// RF02 — o administrador (Administrador) cadastra usuários
// e atribui perfis. Inclui matrícula funcional (feedback 12/05/2026).
export const usuariosRouter = Router();

usuariosRouter.use(autenticar, permitirCom('USUARIOS_ADMINISTRAR'), confirmarAdministradorNoBanco);

const usuarioSelect = {
  id: true,
  nome: true,
  email: true,
  matricula: true,
  perfil: true,
  ativo: true,
  permissoes: true,
  unidadeId: true,
  unidade: { select: { nome: true } },
  prestadorId: true,
  prestador: { select: { nome: true } },
  criadoEm: true,
};

usuariosRouter.get('/', async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: usuarioSelect,
    orderBy: { nome: 'asc' },
  });
  res.json(usuarios);
});

const permissoesSchema = z.array(z.enum(TODAS_PERMISSOES)).transform((l) => [...new Set(l)]);

const criarSchema = z.object({
  // Cadastro prévio: basta e-mail e perfil. Nome e matrícula são provisórios e o primeiro login pelo Keycloak os substitui.
  nome: z.string().min(3).optional(),
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
  matricula: z.string().min(1).optional(),
  perfil: z.nativeEnum(Perfil),
  // Só vale para o perfil OPERADOR; nos demais é descartado
  permissoes: permissoesSchema.optional(),
  unidadeId: z.string().uuid().nullable().optional(),
  prestadorId: z.string().uuid().nullable().optional(),
});

// Terceirizada representa um prestador de serviço; os demais perfis não têm prestador
async function validarPrestador(perfil: Perfil, prestadorId: string | null | undefined) {
  if (perfil === Perfil.TERCEIRIZADA) {
    if (!prestadorId) throw new AppError('Usuários terceirizados devem estar vinculados a um prestador de serviço.', 422);
    const existe = await prisma.prestadorServico.findUnique({ where: { id: prestadorId }, select: { id: true } });
    if (!existe) throw new AppError('Prestador de serviço não encontrado.', 422);
  } else if (prestadorId) {
    throw new AppError('Somente usuários terceirizados podem ser vinculados a um prestador de serviço.', 422);
  }
}

usuariosRouter.post('/', validarBody(criarSchema), async (req, res) => {
  const { email, perfil, unidadeId, prestadorId } = req.body;
  const permissoes: Permissao[] = perfil === Perfil.OPERADOR ? (req.body.permissoes ?? []) : [];
  const nome: string = req.body.nome ?? email.split('@')[0];
  const matricula: string = req.body.matricula ?? email;
  const jaExiste = await prisma.usuario.findFirst({
    where: { OR: [{ email }, { matricula }] },
  });
  if (jaExiste) {
    throw new AppError('Já existe usuário com este e-mail ou matrícula.', 409);
  }
  if ((perfil === Perfil.UNIDADE || perfil === Perfil.GALPAO) && !unidadeId) {
    throw new AppError('Usuários de unidade ou galpão devem estar vinculados a uma unidade.', 422);
  }
  await validarPrestador(perfil, prestadorId);
  const usuario = await prisma.usuario.create({
    data: {
      nome,
      email,
      matricula,
      perfil,
      permissoes,
      unidadeId: unidadeId ?? null,
      prestadorId: prestadorId ?? null,
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
  permissoes: permissoesSchema.optional(),
  unidadeId: z.string().uuid().nullable().optional(),
  prestadorId: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

usuariosRouter.patch('/:id', validarBody(atualizarSchema), async (req, res) => {
  const antes = await prisma.usuario.findUnique({
    where: { id: req.params.id },
    select: usuarioSelect,
  });
  if (!antes) throw new AppError('Usuário não encontrado.', 404);
  const dados = req.body;

  // Perfil e prestador precisam continuar coerentes depois da edição
  const perfilFinal = (dados.perfil ?? antes.perfil) as Perfil;
  if (perfilFinal === Perfil.TERCEIRIZADA) {
    await validarPrestador(perfilFinal, dados.prestadorId !== undefined ? dados.prestadorId : antes.prestadorId);
  } else {
    await validarPrestador(perfilFinal, dados.prestadorId);
    if (antes.prestadorId) dados.prestadorId = null;
  }

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
  // Permissões só existem para o Operador: ao mudar de perfil elas são zeradas
  if (perfilFinal !== Perfil.OPERADOR) dados.permissoes = [];
  else if (dados.permissoes === undefined && antes.perfil !== Perfil.OPERADOR) dados.permissoes = [];

  // O sistema nunca fica sem um Operador ativo capaz de administrar usuários e permissões
  const eraAdministrador = antes.ativo && antes.perfil === Perfil.OPERADOR && antes.permissoes.includes('USUARIOS_ADMINISTRAR');
  const continuaAdministrador =
    (dados.ativo ?? antes.ativo) &&
    perfilFinal === Perfil.OPERADOR &&
    (dados.permissoes ?? antes.permissoes).includes('USUARIOS_ADMINISTRAR');

  // Conferência e gravação na mesma transação, com os administradores travados: dois pedidos simultâneos
  // (um tirando a permissão de cada um dos dois últimos) esperam um ao outro e o segundo enxerga o resultado do primeiro.
  const usuario = await prisma.$transaction(async (tx) => {
    if (eraAdministrador && !continuaAdministrador) {
      await tx.$queryRaw`SELECT id FROM usuario WHERE ativo = true AND perfil = 'OPERADOR' AND 'USUARIOS_ADMINISTRAR' = ANY(permissoes) FOR UPDATE`;
      const outros = await tx.usuario.count({
        where: { id: { not: req.params.id }, ativo: true, perfil: Perfil.OPERADOR, permissoes: { has: 'USUARIOS_ADMINISTRAR' } },
      });
      if (outros === 0) {
        throw new AppError(
          'Este é o último operador com a permissão de administrar usuários. Conceda a permissão a outro operador antes de retirá-la, desativá-lo ou mudar o perfil.',
          422,
        );
      }
    }
    const atualizado = await tx.usuario.update({
      where: { id: req.params.id },
      data: dados,
      select: usuarioSelect,
    });
    await registrarAuditoria(
      {
        usuarioId: req.usuario!.sub,
        acao: 'ATUALIZAR_USUARIO',
        entidade: 'usuario',
        entidadeId: atualizado.id,
        dadosAntes: antes,
        dadosDepois: atualizado,
      },
      tx,
    );
    return atualizado;
  });
  res.json(usuario);
});
