import { EstadoConservacao, Prisma, StatusEquipamento } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { AuthPayload } from '../../middlewares/auth';

export interface FiltrosInventario {
  unidadeId?: string;
  tipoEquipamentoId?: string;
  categoriaId?: string;
  estadoConservacao?: EstadoConservacao;
  status?: StatusEquipamento;
  busca?: string;
}

// RF08 (unidade vê o próprio inventário) / RF09 (gestor vê tudo com filtros)
export function montarFiltroVisibilidade(usuario: AuthPayload): Prisma.EquipamentoWhereInput {
  if (usuario.perfil === 'UNIDADE' || usuario.perfil === 'GALPAO') {
    if (!usuario.unidadeId) {
      throw new AppError('Usuário não está vinculado a uma unidade.', 403);
    }
    return { unidadeId: usuario.unidadeId };
  }
  return {};
}

export async function listar(usuario: AuthPayload, filtros: FiltrosInventario) {
  const where: Prisma.EquipamentoWhereInput = {
    ...montarFiltroVisibilidade(usuario),
    ...(filtros.unidadeId ? { unidadeId: filtros.unidadeId } : {}),
    ...(filtros.tipoEquipamentoId ? { tipoEquipamentoId: filtros.tipoEquipamentoId } : {}),
    ...(filtros.categoriaId ? { tipoEquipamento: { categoriaId: filtros.categoriaId } } : {}),
    ...(filtros.estadoConservacao ? { estadoConservacao: filtros.estadoConservacao } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.busca
      ? {
          OR: [
            { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } },
            { descricao: { contains: filtros.busca, mode: 'insensitive' as const } },
            { tipoEquipamento: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidade: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
  return prisma.equipamento.findMany({
    where,
    include: {
      tipoEquipamento: { include: { categoria: { select: { nome: true } } } },
      unidade: { select: { id: true, nome: true } },
      unidadeTemporaria: { select: { id: true, nome: true } },
    },
    orderBy: { tombamento: 'asc' },
  });
}

export async function buscarPorId(usuario: AuthPayload, id: string) {
  const equipamento = await prisma.equipamento.findUnique({
    where: { id },
    include: {
      tipoEquipamento: { include: { categoria: true } },
      unidade: { select: { id: true, nome: true } },
      unidadeTemporaria: { select: { id: true, nome: true } },
      movimentacoes: {
        orderBy: { criadoEm: 'desc' },
        include: {
          unidadeOrigem: { select: { nome: true } },
          unidadeDestino: { select: { nome: true } },
          usuario: { select: { nome: true } },
        },
      },
      manutencoes: {
        orderBy: { criadoEm: 'desc' },
        select: {
          id: true,
          status: true,
          descricaoProblema: true,
          custoFinal: true,
          orcamentoValor: true,
          criadoEm: true,
          dataConclusao: true,
        },
      },
    },
  });
  if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
  if (
    (usuario.perfil === 'UNIDADE' || usuario.perfil === 'GALPAO') &&
    equipamento.unidadeId !== usuario.unidadeId &&
    equipamento.unidadeTemporariaId !== usuario.unidadeId
  ) {
    throw new AppError('Este equipamento não pertence à sua unidade.', 403);
  }
  return equipamento;
}

export interface DadosCadastro {
  tombamento: string;
  descricao: string;
  tipoEquipamentoId: string;
  unidadeId: string;
  estadoConservacao: EstadoConservacao;
  emendaParlamentar: boolean;
  dataAquisicao?: Date | null;
  observacoes?: string | null;
}

// UC02/RF06 — cadastro manual pelo Galpão; RN01 — tombamento único
export async function cadastrar(usuarioId: string, dados: DadosCadastro) {
  const existe = await prisma.equipamento.findUnique({
    where: { tombamento: dados.tombamento },
  });
  if (existe) {
    throw new AppError(`Já existe equipamento com o tombamento ${dados.tombamento}.`, 409);
  }
  const equipamento = await prisma.$transaction(async (tx) => {
    const criado = await tx.equipamento.create({
      data: dados,
      include: { unidade: { select: { nome: true } } },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: criado.id,
        tipo: 'CADASTRO',
        descricao: `Cadastro inicial na unidade ${criado.unidade.nome}`,
        unidadeDestinoId: criado.unidadeId,
        usuarioId,
      },
    });
    await registrarAuditoria(
      {
        usuarioId,
        acao: 'CADASTRAR_EQUIPAMENTO',
        entidade: 'equipamento',
        entidadeId: criado.id,
        dadosDepois: { tombamento: criado.tombamento, unidadeId: criado.unidadeId },
      },
      tx,
    );
    return criado;
  });
  return equipamento;
}

export interface DadosAtualizacao {
  descricao?: string;
  estadoConservacao?: EstadoConservacao;
  observacoes?: string | null;
  emendaParlamentar?: boolean;
}

// RN01 — o tombamento é imutável: não está entre os campos editáveis
export async function atualizar(usuarioId: string, id: string, dados: DadosAtualizacao) {
  const antes = await prisma.equipamento.findUnique({ where: { id } });
  if (!antes) throw new AppError('Equipamento não encontrado.', 404);
  const equipamento = await prisma.$transaction(async (tx) => {
    const atualizado = await tx.equipamento.update({ where: { id }, data: dados });
    await registrarAuditoria(
      {
        usuarioId,
        acao: 'ATUALIZAR_EQUIPAMENTO',
        entidade: 'equipamento',
        entidadeId: id,
        dadosAntes: {
          descricao: antes.descricao,
          estadoConservacao: antes.estadoConservacao,
          observacoes: antes.observacoes,
          emendaParlamentar: antes.emendaParlamentar,
        },
        dadosDepois: dados,
      },
      tx,
    );
    return atualizado;
  });
  return equipamento;
}
