import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';

type UsuarioComUnidade = Prisma.UsuarioGetPayload<{ include: { unidade: true } }>;

function gerarSessao(usuario: UsuarioComUnidade) {
  const token = jwt.sign(
    {
      nome: usuario.nome,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
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
    },
  };
}

// RF01 — login com e-mail e senha; RNF04 — hash bcrypt
export async function login(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { unidade: true },
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

// Impersonação — só o Gestor de Patrimônio (via rota) consegue gerar uma
// sessão em nome de outro usuário, pra facilitar testar os outros perfis.
export async function impersonar(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    include: { unidade: true },
  });
  if (!usuario || !usuario.ativo) {
    throw new AppError('Usuário não encontrado ou inativo.', 404);
  }
  return gerarSessao(usuario);
}
