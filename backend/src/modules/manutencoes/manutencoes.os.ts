import { TipoDocumentoOS } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import * as avisos from '../../services/avisos.eventos';
import { AuthPayload } from '../../middlewares/auth';
import { buscarPorId, includePadrao } from './manutencoes.service';

// Ordem de serviço do chamado civil. O prestador a gera (o chamado passa a "em rota"), executa, marca "Executado" e envia
// depois a OS assinada em papel (PDF). Depois de enviado o documento não se edita: se o fiscal o recusar, o prestador envia
// outro. Com a OS assinada válida o chamado segue para a confirmação da Unidade.

const vigente = (docs: Array<{ tipo: TipoDocumentoOS; recusadoEm: Date | null }>, tipo: TipoDocumentoOS) =>
  docs.some((d) => d.tipo === tipo && !d.recusadoEm);

function exigirCivil(tipo: string) {
  if (tipo !== 'CIVIL') throw new AppError('A ordem de serviço só existe na manutenção civil.', 422);
}

export async function gerarOS(usuario: AuthPayload, id: string, dados: { equipe: string; dataPrevista: Date; escopo: string }) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  return prisma.$transaction(async (tx) => {
    // Trava o chamado: duas OS ao mesmo tempo não passam (e a OS é única por chamado, também no banco)
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true, ordemServico: { select: { id: true } } } });
    // Chamados que já estavam em execução antes da OS existir também podem gerá-la, uma vez
    const aguardando = atual.status === 'AGUARDANDO_EXECUCAO';
    const legado = atual.status === 'EM_EXECUCAO' && !atual.ordemServico;
    if (!aguardando && !legado) {
      throw new AppError(
        atual.ordemServico ? 'Este chamado já tem ordem de serviço.' : 'Só é possível gerar a ordem de serviço de um chamado aguardando execução.',
        422,
      );
    }
    if (aguardando) {
      const mudou = await tx.manutencao.updateMany({ where: { id, status: 'AGUARDANDO_EXECUCAO' }, data: { status: 'EM_EXECUCAO' } });
      if (mudou.count === 0) throw new AppError('O chamado mudou de situação. Atualize a página.', 409);
    }
    const os = await tx.ordemServico.create({ data: { manutencaoId: id, geradaPorId: usuario.sub, ...dados } });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'GERAR_OS',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: atual.status },
        dadosDepois: { status: 'EM_EXECUCAO', osNumero: os.numero, dataPrevista: dados.dataPrevista },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

// O prestador envia a OS assinada. Com ela válida, o chamado segue para a Unidade confirmar.
export async function enviarDocumento(usuario: AuthPayload, id: string, dados: { tipo: TipoDocumentoOS; arquivo: string }) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  const { atualizada, completo } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true, ordemServico: { include: { documentos: true } } } });
    if (atual.status !== 'EXECUTADO' || !atual.ordemServico) {
      throw new AppError('Os documentos são enviados depois de marcar o serviço como executado.', 422);
    }
    const documentos = atual.ordemServico.documentos;
    // Já enviado não se edita nem se duplica; só um novo documento no lugar de um recusado
    if (vigente(documentos, dados.tipo)) {
      throw new AppError('Este documento já foi enviado e não pode ser alterado. Só é possível enviar outro se o fiscal o recusar.', 422);
    }
    await tx.documentoOS.create({ data: { ordemServicoId: atual.ordemServico.id, tipo: dados.tipo, arquivo: dados.arquivo, enviadoPorId: usuario.sub } });
    const todos = [...documentos, { tipo: dados.tipo, recusadoEm: null }];
    const completo = vigente(todos, 'OS_ASSINADA');
    if (completo) {
      const mudou = await tx.manutencao.updateMany({ where: { id, status: 'EXECUTADO' }, data: { status: 'AGUARDANDO_RETORNO', aguardandoRetornoEm: new Date() } });
      if (mudou.count === 0) throw new AppError('O chamado mudou de situação. Atualize a página.', 409);
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ENVIAR_DOCUMENTO_OS',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { tipo: dados.tipo, completo },
      },
      tx,
    );
    return { atualizada: await tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao }), completo };
  });
  if (completo) await avisos.avisoReparoConcluido(atualizada);
  return atualizada;
}

// O fiscal recusa um documento enviado: o prestador precisa enviar outro. O chamado volta a "executado" (documentação pendente).
export async function recusarDocumento(usuario: AuthPayload, id: string, documentoId: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true, ordemServico: { select: { id: true } } } });
    if (!['EXECUTADO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO'].includes(atual.status) || !atual.ordemServico) {
      throw new AppError('Os documentos só podem ser recusados antes da aprovação final.', 422);
    }
    const recusou = await tx.documentoOS.updateMany({
      where: { id: documentoId, ordemServicoId: atual.ordemServico.id, recusadoEm: null },
      data: { recusadoEm: new Date(), motivoRecusa: motivo },
    });
    if (recusou.count === 0) throw new AppError('Documento não encontrado ou já recusado.', 404);
    if (atual.status !== 'EXECUTADO') {
      // A Unidade confirmou com base em documentos que mudaram: confirma de novo quando o prestador reenviar
      await tx.manutencao.update({ where: { id }, data: { status: 'EXECUTADO', aguardandoRetornoEm: null, confirmadoUnidade: false } });
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'RECUSAR_DOCUMENTO_OS',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: atual.status },
        dadosDepois: { status: 'EXECUTADO', documentoId, motivo },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoDocumentoRecusado(atualizada, motivo);
  return atualizada;
}
