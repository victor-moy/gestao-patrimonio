import { Perfil, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../errors/AppError';

type Cliente = Prisma.TransactionClient | typeof prisma;

export type DadosAviso = {
  tipo: string;
  titulo: string;
  mensagem: string;
  href?: string | null;
  solicitacaoId?: string | null;
  manutencaoId?: string | null;
};

export function codigoSolicitacao(numero: number) {
  return `SOL-${String(numero).padStart(4, '0')}`;
}

export function codigoManutencao(numero: number) {
  return `MAN-${String(numero).padStart(4, '0')}`;
}

export async function idsUsuariosPorPerfil(perfil: Perfil, cliente: Cliente = prisma) {
  const usuarios = await cliente.usuario.findMany({
    where: { ativo: true, perfil },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

export async function idsUsuariosDaUnidade(unidadeId: string, cliente: Cliente = prisma) {
  const usuarios = await cliente.usuario.findMany({
    where: { ativo: true, perfil: Perfil.UNIDADE, unidadeId },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

export async function idsUsuariosDoPrestador(prestadorId: string, cliente: Cliente = prisma) {
  const usuarios = await cliente.usuario.findMany({
    where: { ativo: true, perfil: Perfil.TERCEIRIZADA, prestadorId },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Cria um aviso por destinatário. Idempotente ao conjunto vazio; falhas não revertem a mutação de domínio. */
export async function criarAvisos(usuarioIds: string[], dados: DadosAviso, cliente: Cliente = prisma) {
  const unicos = [...new Set(usuarioIds.filter(Boolean))];
  if (unicos.length === 0) return;
  try {
    await cliente.avisoUsuario.createMany({
      data: unicos.map((usuarioId) => ({
        usuarioId,
        tipo: dados.tipo,
        titulo: dados.titulo,
        mensagem: dados.mensagem,
        href: dados.href ?? null,
        solicitacaoId: dados.solicitacaoId ?? null,
        manutencaoId: dados.manutencaoId ?? null,
      })),
    });
  } catch (err) {
    console.error('Falha ao criar avisos in-app:', err);
  }
}

const avisoSelect = {
  id: true,
  tipo: true,
  titulo: true,
  mensagem: true,
  href: true,
  solicitacaoId: true,
  manutencaoId: true,
  lidaEm: true,
  criadoEm: true,
} as const;

export async function listarAvisos(usuarioId: string, apenasNaoLidas: boolean, limite = 10) {
  const take = Math.min(Math.max(limite, 1), 50);
  const where = {
    usuarioId,
    ...(apenasNaoLidas ? { lidaEm: null } : {}),
  };
  const [itens, total] = await Promise.all([
    prisma.avisoUsuario.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take,
      select: avisoSelect,
    }),
    prisma.avisoUsuario.count({ where }),
  ]);
  return { itens, total };
}

export async function marcarAvisoLido(usuarioId: string, avisoId: string) {
  const atualizado = await prisma.avisoUsuario.updateMany({
    where: { id: avisoId, usuarioId, lidaEm: null },
    data: { lidaEm: new Date() },
  });
  if (atualizado.count === 0) {
    const existe = await prisma.avisoUsuario.findFirst({ where: { id: avisoId, usuarioId } });
    if (!existe) throw new AppError('Aviso não encontrado.', 404);
  }
  return prisma.avisoUsuario.findFirstOrThrow({
    where: { id: avisoId, usuarioId },
    select: avisoSelect,
  });
}

export async function marcarTodosAvisosLidos(usuarioId: string) {
  const resultado = await prisma.avisoUsuario.updateMany({
    where: { usuarioId, lidaEm: null },
    data: { lidaEm: new Date() },
  });
  return { marcados: resultado.count };
}
