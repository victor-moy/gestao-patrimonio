import { StatusManutencao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import * as avisos from '../../services/avisos.eventos';
import { codigoManutencao } from '../../services/avisos.service';
import type { AuthPayload } from '../../middlewares/auth';
import {
  buscarPorId,
  exigirTriagem,
  includePadrao,
  liberarEquipamento,
  MAX_PROBLEMAS_EXTRAS,
  STATUS_QUE_ACEITAM_PROBLEMA,
} from './manutencoes.service';

// Apoio da triagem: ver os chamados já existentes na unidade, ligar chamados relacionados e unificar duplicados.
// Vale por tipo: o triador civil só mexe em chamado civil e o de equipamentos em chamado de equipamento.

const STATUS_NA_TRIAGEM: StatusManutencao[] = ['PENDENTE_APROVACAO', 'AVALIADO'];
const STATUS_FINAIS: StatusManutencao[] = ['NEGADA', 'ENCERRADA', 'CONCLUIDA', 'BAIXADO'];
const LIMITE_CHAMADOS_DA_UNIDADE = 60;
const LIMITE_TEXTO_PROBLEMA = 2000;

// Os dados mínimos para decidir se dois chamados podem se relacionar (mesma unidade e mesmo tipo)
async function carregarBasico(id: string) {
  const m = await prisma.manutencao.findUnique({ where: { id }, select: { id: true, numero: true, tipo: true, unidadeId: true } });
  if (!m) throw new AppError('Manutenção não encontrada.', 404);
  return m;
}

async function carregarOutroDaMesmaUnidade(base: { id: string; tipo: string; unidadeId: string }, outroId: string) {
  if (outroId === base.id) throw new AppError('Escolha outro chamado: não dá para relacionar um chamado com ele mesmo.', 422);
  const outro = await carregarBasico(outroId).catch(() => {
    throw new AppError('Chamado não encontrado.', 422);
  });
  if (outro.unidadeId !== base.unidadeId || outro.tipo !== base.tipo) {
    throw new AppError('Só é possível relacionar chamados da mesma unidade e do mesmo tipo.', 422);
  }
  return outro;
}

// Os outros chamados da unidade (mesmo tipo), com o que têm em comum com o que está sendo triado
export async function chamadosDaUnidade(usuario: AuthPayload, id: string) {
  const base = await prisma.manutencao.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      unidadeId: true,
      categoriaCivilId: true,
      equipamento: { select: { id: true, tipoEquipamentoId: true } },
      setores: { select: { setorId: true } },
    },
  });
  if (!base) throw new AppError('Manutenção não encontrada.', 404);
  exigirTriagem(usuario, base.tipo);

  const [outros, vinculos] = await Promise.all([
    prisma.manutencao.findMany({
      where: { id: { not: id }, unidadeId: base.unidadeId, tipo: base.tipo },
      orderBy: { criadoEm: 'desc' },
      take: 100,
      select: {
        id: true,
        numero: true,
        titulo: true,
        status: true,
        abertoPorContestacao: true,
        localAfetado: true,
        criadoEm: true,
        dataConclusao: true,
        categoriaCivilId: true,
        categoriaCivil: { select: { nome: true } },
        setores: { select: { setorId: true } },
        equipamento: { select: { id: true, tombamento: true, descricao: true, tipoEquipamentoId: true, tipoEquipamento: { select: { nome: true } } } },
      },
    }),
    prisma.manutencaoVinculo.findMany({
      where: { OR: [{ manutencaoId: id }, { relacionadaId: id }] },
      select: { manutencaoId: true, relacionadaId: true },
    }),
  ]);

  const ligados = new Set(vinculos.flatMap((v) => [v.manutencaoId, v.relacionadaId]));
  const setoresDoTriado = new Set(base.setores.map((s) => s.setorId));
  const lista = outros.map((o) => {
    const relacao = {
      categoria: Boolean(base.categoriaCivilId) && o.categoriaCivilId === base.categoriaCivilId,
      setor: o.setores.some((s) => setoresDoTriado.has(s.setorId)),
      equipamento: Boolean(base.equipamento) && o.equipamento?.id === base.equipamento?.id,
      tipoEquipamento: Boolean(base.equipamento) && o.equipamento?.tipoEquipamentoId === base.equipamento?.tipoEquipamentoId,
    };
    const pontos = Object.values(relacao).filter(Boolean).length;
    return {
      id: o.id,
      numero: o.numero,
      titulo: o.titulo,
      status: o.status,
      abertoPorContestacao: o.abertoPorContestacao,
      localAfetado: o.localAfetado,
      categoria: o.categoriaCivil?.nome ?? null,
      equipamento: o.equipamento ? `${o.equipamento.tipoEquipamento.nome} · ${o.equipamento.tombamento}` : null,
      criadoEm: o.criadoEm,
      dataConclusao: o.dataConclusao,
      relacao,
      relacionado: pontos > 0,
      vinculado: ligados.has(o.id),
      pontos,
    };
  });
  // Os que têm mais em comum primeiro; dentro disso, os mais recentes (a busca já veio do mais novo ao mais antigo)
  return lista
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.pontos - a.c.pontos || a.i - b.i)
    .slice(0, LIMITE_CHAMADOS_DA_UNIDADE)
    .map(({ c: { pontos: _pontos, ...resto } }) => resto);
}

// Os chamados ligados a este (nos dois sentidos)
export async function listarVinculos(usuario: AuthPayload, id: string) {
  await buscarPorId(usuario, id); // respeita quem pode ver este chamado (a Unidade só os da própria unidade)
  const vinculos = await prisma.manutencaoVinculo.findMany({
    where: { OR: [{ manutencaoId: id }, { relacionadaId: id }] },
    orderBy: { criadoEm: 'asc' },
    select: {
      criadoEm: true,
      manutencaoId: true,
      manutencao: { select: { id: true, numero: true, titulo: true, status: true } },
      relacionada: { select: { id: true, numero: true, titulo: true, status: true } },
    },
  });
  return vinculos.map((v) => ({ ...(v.manutencaoId === id ? v.relacionada : v.manutencao), vinculadoEm: v.criadoEm }));
}

export async function vincular(usuario: AuthPayload, id: string, relacionadaId: string) {
  const base = await carregarBasico(id);
  exigirTriagem(usuario, base.tipo);
  const outro = await carregarOutroDaMesmaUnidade(base, relacionadaId);
  await prisma.$transaction(async (tx) => {
    const jaExiste = await tx.manutencaoVinculo.findFirst({
      where: { OR: [{ manutencaoId: id, relacionadaId: outro.id }, { manutencaoId: outro.id, relacionadaId: id }] },
      select: { id: true },
    });
    if (jaExiste) throw new AppError('Estes chamados já estão relacionados.', 409);
    await tx.manutencaoVinculo.create({ data: { manutencaoId: id, relacionadaId: outro.id, criadoPorId: usuario.sub } });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'VINCULAR_CHAMADO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { relacionada: codigoManutencao(outro.numero), relacionadaId: outro.id },
      },
      tx,
    );
  });
  return listarVinculos(usuario, id);
}

export async function desvincular(usuario: AuthPayload, id: string, relacionadaId: string) {
  const base = await carregarBasico(id);
  exigirTriagem(usuario, base.tipo);
  await prisma.$transaction(async (tx) => {
    const apagados = await tx.manutencaoVinculo.deleteMany({
      where: { OR: [{ manutencaoId: id, relacionadaId }, { manutencaoId: relacionadaId, relacionadaId: id }] },
    });
    if (apagados.count === 0) throw new AppError('Estes chamados não estão relacionados.', 404);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao: 'DESVINCULAR_CHAMADO', entidade: 'manutencao', entidadeId: id, dadosAntes: { relacionadaId } },
      tx,
    );
  });
  return listarVinculos(usuario, id);
}

function problemaDoChamado(m: { numero: number; titulo: string | null; descricaoProblema: string }) {
  const cabecalho = `Chamado ${codigoManutencao(m.numero)}${m.titulo ? ` · ${m.titulo}` : ''}: `;
  return `${cabecalho}${m.descricaoProblema}`.slice(0, LIMITE_TEXTO_PROBLEMA);
}

// Duplicado: o chamado da triagem é encerrado como unificado ao original. No civil, enquanto o original ainda não foi ao
// prestador, o problema (texto e fotos) é acrescentado a ele, para nada se perder.
export async function unificar(usuario: AuthPayload, id: string, dados: { chamadoOriginalId: string; motivo?: string }) {
  const manutencao = await buscarPorId(usuario, id);
  exigirTriagem(usuario, manutencao.tipo);
  if (!STATUS_NA_TRIAGEM.includes(manutencao.status)) {
    throw new AppError('Só é possível unificar um chamado que ainda está na triagem.', 422);
  }
  if (dados.chamadoOriginalId === id) throw new AppError('O chamado original não pode ser o próprio chamado.', 422);

  const atualizada = await prisma.$transaction(async (tx) => {
    // Trava os dois chamados sempre na mesma ordem (sem impasse se alguém unificar o inverso ao mesmo tempo)
    for (const trava of [id, dados.chamadoOriginalId].sort()) await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${trava} FOR UPDATE`;
    const original = await tx.manutencao.findUnique({
      where: { id: dados.chamadoOriginalId },
      select: { id: true, numero: true, tipo: true, unidadeId: true, status: true, _count: { select: { problemasExtras: true } } },
    });
    if (!original) throw new AppError('Chamado original não encontrado.', 422);
    if (original.unidadeId !== manutencao.unidadeId || original.tipo !== manutencao.tipo) {
      throw new AppError('O chamado original precisa ser da mesma unidade e do mesmo tipo.', 422);
    }
    if (STATUS_FINAIS.includes(original.status)) throw new AppError('O chamado original já está negado, encerrado ou concluído.', 422);

    const motivo = dados.motivo?.trim() || `Unificado ao chamado ${codigoManutencao(original.numero)}.`;
    // Condição de status na gravação: decisões ao mesmo tempo não se atropelam
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: { in: STATUS_NA_TRIAGEM } },
      data: { status: 'ENCERRADA', tipoEncerramento: 'UNIFICADO', motivoEncerramento: motivo, chamadoOriginalId: original.id, decididoPorId: usuario.sub },
    });
    if (gravado.count === 0) throw new AppError('Este chamado já saiu da triagem. Atualize a página.', 409);
    if (manutencao.equipamentoId) {
      await liberarEquipamento(tx, manutencao.equipamentoId, manutencao.unidadeId, usuario.sub, `Chamado unificado ao ${codigoManutencao(original.numero)}.`);
    }
    const acrescentou =
      manutencao.tipo === 'CIVIL' && STATUS_QUE_ACEITAM_PROBLEMA.includes(original.status) && original._count.problemasExtras < MAX_PROBLEMAS_EXTRAS;
    if (acrescentou) {
      await tx.manutencaoProblema.create({
        data: {
          manutencaoId: original.id,
          descricao: problemaDoChamado(manutencao),
          fotos: [...manutencao.fotos, ...manutencao.problemasExtras.flatMap((p) => p.fotos)],
          criadoPorId: usuario.sub,
        },
      });
    }
    const m = await tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'UNIFICAR_CHAMADO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'ENCERRADA', chamadoOriginalId: original.id, acrescentouAoOriginal: acrescentou, motivo },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    'Chamado unificado',
    `O chamado ${atualizada.titulo ?? ''} foi unificado a outro já aberto para o mesmo problema.`,
  );
  await avisos.avisoManutencaoEncerrada(atualizada, atualizada.motivoEncerramento ?? 'Unificado a outro chamado.');
  return atualizada;
}
