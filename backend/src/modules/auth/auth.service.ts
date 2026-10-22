import jwt from 'jsonwebtoken';
import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import type { AuthPayload, ImpersonadoPor } from '../../middlewares/auth';
import { registrarAuditoria } from '../../services/auditoria.service';
import type { IdentidadeKeycloak } from './oidc.service';

type UsuarioComUnidade = Prisma.UsuarioGetPayload<{ include: { unidade: true; prestador: true } }>;

function gerarSessao(usuario: UsuarioComUnidade, impersonadoPor?: ImpersonadoPor) {
  const token = jwt.sign(
    {
      nome: usuario.nome,
      perfil: usuario.perfil,
      unidadeId: usuario.unidadeId,
      prestadorId: usuario.prestadorId,
      ...(impersonadoPor ? { impersonadoPor } : {}),
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

// Primeiro login pelo Keycloak vincula a conta ao `sub` (identificador fixo). Quem já existia no SGP é encontrado pelo
// e-mail e mantém perfil e unidade; quem é novo entra como SEM_ACESSO até um Administrador atribuir o perfil.
export async function entrarPeloKeycloak(identidade: IdentidadeKeycloak) {
  const incluir = { unidade: true, prestador: true } as const;
  let usuario = await prisma.usuario.findUnique({ where: { keycloakSub: identidade.sub }, include: incluir });

  if (!usuario) {
    const porEmail = await prisma.usuario.findFirst({
      where: { email: { equals: identidade.email, mode: 'insensitive' } },
      include: incluir,
    });
    if (porEmail?.keycloakSub) {
      // O e-mail já pertence a outra identidade do Keycloak: não rouba a conta.
      throw new AppError('Este e-mail já está vinculado a outra conta institucional.', 403);
    }
    if (porEmail) {
      // Cadastro prévio (só e-mail e perfil) tem a matrícula igual ao e-mail: nome e matrícula reais vêm do Keycloak
      const dadosReais =
        porEmail.matricula === porEmail.email
          ? { nome: identidade.nome, matricula: await matriculaLivre(identidade) }
          : {};
      // Condição na gravação: se outro login vinculou no meio do caminho, nada é sobrescrito
      const { count } = await prisma.usuario.updateMany({
        where: { id: porEmail.id, keycloakSub: null },
        data: { keycloakSub: identidade.sub, ...dadosReais },
      });
      if (count === 0) throw new AppError('Não foi possível vincular a conta. Tente novamente.', 409);
      usuario = { ...porEmail, keycloakSub: identidade.sub, ...dadosReais };
      await registrarAuditoria({
        usuarioId: porEmail.id,
        acao: 'VINCULAR_KEYCLOAK',
        entidade: 'usuario',
        entidadeId: porEmail.id,
      });
    } else {
      usuario = await criarUsuarioSemAcesso(identidade, incluir);
    }
  }

  if (!usuario.ativo) throw new AppError('Usuário desativado. Procure o administrador do sistema.', 403);
  return gerarSessao(usuario);
}

// A matrícula é única; o login do AD serve, e o `sub` garante um valor livre se ele já estiver em uso
async function matriculaLivre(identidade: IdentidadeKeycloak) {
  const candidata = identidade.usuario ?? `kc-${identidade.sub}`;
  const emUso = await prisma.usuario.findUnique({ where: { matricula: candidata }, select: { id: true } });
  return emUso ? `kc-${identidade.sub}` : candidata;
}

async function criarUsuarioSemAcesso(
  identidade: IdentidadeKeycloak,
  incluir: { unidade: true; prestador: true },
) {
  const usuario = await prisma.usuario.create({
    data: {
      nome: identidade.nome,
      email: identidade.email,
      matricula: await matriculaLivre(identidade),
      perfil: Perfil.SEM_ACESSO,
      keycloakSub: identidade.sub,
    },
    include: incluir,
  });
  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: 'CRIAR_USUARIO_KEYCLOAK',
    entidade: 'usuario',
    entidadeId: usuario.id,
    dadosDepois: { email: usuario.email, perfil: usuario.perfil },
  });
  return usuario;
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
  if (usuario.id === ator.sub && !ator.impersonadoPor) return gerarSessao(usuario);
  const original: ImpersonadoPor = ator.impersonadoPor ?? {
    id: ator.sub,
    nome: ator.nome,
    perfil: ator.perfil,
  };
  return gerarSessao(usuario, original);
}
