import jwt from 'jsonwebtoken';
import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import type { IdentidadeKeycloak } from './oidc.service';

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

// Acesso temporário da demonstração: cada perfil entra como o usuário de demonstração do seed. Só existe se a rota
// /auth/demo estiver ligada (DEMO_LOGIN_CHAVE) e some junto com ela quando o Keycloak estiver funcionando.
const USUARIOS_DEMONSTRACAO: Record<string, { email: string; perfil: Perfil }> = {
  admin: { email: 'gestor@joinville.sc.gov.br', perfil: Perfil.OPERADOR },
  unidade: { email: 'ubs.centro@joinville.sc.gov.br', perfil: Perfil.UNIDADE },
  galpao: { email: 'galpao.user@joinville.sc.gov.br', perfil: Perfil.GALPAO },
  terceirizada: { email: 'terceirizada@tecsaude.com.br', perfil: Perfil.TERCEIRIZADA },
};

export async function entrarDemonstracao(nome: string) {
  const alvo = Object.hasOwn(USUARIOS_DEMONSTRACAO, nome) ? USUARIOS_DEMONSTRACAO[nome] : undefined;
  if (!alvo) throw new AppError('Perfil de demonstração desconhecido.', 404);
  const usuario = await prisma.usuario.findUnique({
    where: { email: alvo.email },
    include: { unidade: true, prestador: true },
  });
  if (!usuario || !usuario.ativo || usuario.perfil !== alvo.perfil) {
    throw new AppError('Usuário de demonstração indisponível.', 404);
  }
  await registrarAuditoria({
    usuarioId: usuario.id,
    acao: 'LOGIN_DEMONSTRACAO',
    entidade: 'usuario',
    entidadeId: usuario.id,
    dadosDepois: { perfil: usuario.perfil },
  });
  return gerarSessao(usuario);
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
