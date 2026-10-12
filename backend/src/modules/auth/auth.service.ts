import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import type { AuthPayload } from '../../middlewares/auth';

type UsuarioComUnidade = Prisma.UsuarioGetPayload<{ include: { unidade: true; prestador: true } }>;

function gerarSessao(usuario: UsuarioComUnidade) {
  const token = jwt.sign(
    {
      nome: usuario.nome,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      prestadorId: usuario.prestadorId,
    },
    env.jwtSecret,
    { subject: usuario.id, expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );
  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      matricula: usuario.matricula,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      unidadeNome: usuario.unidade?.nome ?? null,
      prestadorId: usuario.prestadorId,
      prestadorNome: usuario.prestador?.nome ?? null,
    },
  };
}

// RF01 — login com e-mail e senha; RNF04 — hash bcrypt
export async function login(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { unidade: true, prestador: true },
  });
  if (!usuario || !usuario.ativo) {
    throw new AppError('E-mail ou senha inválidos.', 401);
  }
  const senhaConfere = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaConfere) {
    throw new AppError('E-mail ou senha inválidos.', 401);
  }
  return gerarSessao(usuario);
}

// Quem pode "entrar como" quem. O Administrador assume qualquer perfil (reúne os poderes dos antigos gestores).
// Os demais perfis não assumem ninguém.
const IMPERSONAVEIS: Partial<Record<Perfil, Perfil[] | 'todos'>> = {
  [Perfil.OPERADOR]: 'todos',
};

function perfisPermitidos(ator: AuthPayload) {
  const regra = IMPERSONAVEIS[ator.perfil];
  if (!regra) throw new AppError('Seu perfil não pode entrar como outro usuário.', 403);
  return regra;
}

// Lista enxuta (sem e-mail nem matrícula) dos usuários ativos em que o ator pode entrar, para o menu do usuário.
// O próprio ator entra na lista (`proprio`), primeiro, para quem está dentro de outro usuário poder voltar à sua conta.
export async function listarImpersonaveis(ator: AuthPayload) {
  const regra = perfisPermitidos(ator);
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, ...(regra === 'todos' ? {} : { perfil: { in: regra } }) },
    select: {
      id: true,
      nome: true,
      perfil: true,
      unidade: { select: { nome: true } },
      prestador: { select: { nome: true } },
    },
    orderBy: { nome: 'asc' },
  });
  const lista = usuarios.map(({ unidade, prestador, ...u }) => ({
    ...u,
    proprio: u.id === ator.sub,
    unidadeNome: unidade?.nome ?? null,
    prestadorNome: prestador?.nome ?? null,
  }));
  return [...lista.filter((u) => u.proprio), ...lista.filter((u) => !u.proprio)];
}

// Impersonação — a rota só deixa passar o Administrador; aqui vale a regra de quem pode assumir quem. A sessão
// gerada é em nome do usuário alvo.
export async function impersonar(usuarioId: string, ator: AuthPayload) {
  const regra = perfisPermitidos(ator);
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { unidade: true, prestador: true },
  });
  if (!usuario || !usuario.ativo) {
    throw new AppError('Usuário não encontrado ou inativo.', 404);
  }
  if (regra !== 'todos' && !regra.includes(usuario.perfil)) {
    throw new AppError('Seu perfil não pode entrar como este tipo de usuário.', 403);
  }
  return gerarSessao(usuario);
}
