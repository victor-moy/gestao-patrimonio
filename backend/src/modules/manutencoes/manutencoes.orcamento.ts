import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import * as avisos from '../../services/avisos.eventos';
import { AuthPayload } from '../../middlewares/auth';
import { buscarPorId, encaminharAoPrestador, includePadrao, vincularItem } from './manutencoes.service';

// Orçamento prévio do chamado civil, para o serviço fora da SINAPI ou que o contrato exige aprovar antes. A avaliação técnica
// solicita; o prestador envia os PDFs do orçamento numa única entrega por rodada; o fiscal aprova, informando o valor aprovado,
// ou rejeita com motivo (o que reabre o envio numa nova rodada); a publicação no Diário Oficial é feita fora do sistema. Em
// risco à vida a avaliação dispensa o orçamento, justificando. (A tabela cotacao_orcamento guarda os arquivos de cada rodada.)

export const MAX_ARQUIVOS_ORCAMENTO = 5;

function exigirCivil(tipo: string) {
  if (tipo !== 'CIVIL') throw new AppError('O orçamento prévio é da manutenção civil.', 422);
}

// A avaliação técnica pede o orçamento: o chamado vai ao prestador só para cotar (ainda não para executar)
export async function solicitarOrcamento(usuario: AuthPayload, id: string, instrucoes: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  if (manutencao.status !== 'AGUARDANDO_AVALIACAO_TECNICA' || !manutencao.contratoItemId) {
    throw new AppError('O orçamento é solicitado durante a avaliação técnica, com o item de contrato escolhido.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const { contratoId } = await vincularItem(tx, manutencao.contratoItemId as string, id, { novaSelecao: false });
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
      data: { status: 'AGUARDANDO_ORCAMENTO', contratoId, instrucoesOrcamento: instrucoes, rodadaOrcamento: 1, motivoRejeicaoOrcamento: null },
    });
    if (gravado.count === 0) throw new AppError('Este chamado já saiu da avaliação técnica.', 409);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao: 'SOLICITAR_ORCAMENTO_CIVIL', entidade: 'manutencao', entidadeId: id, dadosAntes: { status: manutencao.status }, dadosDepois: { status: 'AGUARDANDO_ORCAMENTO', contratoId } },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoOrcamentoSolicitado(atualizada);
  return atualizada;
}

// Risco à vida: o chamado segue ao prestador sem orçamento prévio, com a justificativa registrada
export async function dispensarOrcamento(usuario: AuthPayload, id: string, justificativa: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  return encaminharAoPrestador(usuario, id, {
    de: 'AGUARDANDO_AVALIACAO_TECNICA',
    acao: 'DISPENSAR_ORCAMENTO_RISCO_VIDA',
    parecer: justificativa,
    dispensaOrcamento: justificativa,
  });
}

// O prestador envia os PDFs do orçamento (uma entrega por rodada). Enviados, o chamado aguarda a decisão do fiscal.
export async function enviarOrcamento(usuario: AuthPayload, id: string, arquivos: string[]) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  if (arquivos.length === 0 || arquivos.length > MAX_ARQUIVOS_ORCAMENTO) {
    throw new AppError(`Envie de 1 a ${MAX_ARQUIVOS_ORCAMENTO} arquivos em PDF.`, 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true, rodadaOrcamento: true } });
    if (atual.status !== 'AGUARDANDO_ORCAMENTO') throw new AppError('O chamado não está aguardando orçamento.', 422);
    const jaEnviados = await tx.cotacaoOrcamento.count({ where: { manutencaoId: id, rodada: atual.rodadaOrcamento } });
    if (jaEnviados > 0) throw new AppError('Os arquivos desta rodada já foram enviados.', 422);
    await tx.cotacaoOrcamento.createMany({
      data: arquivos.map((arquivo) => ({ manutencaoId: id, rodada: atual.rodadaOrcamento, arquivo, enviadoPorId: usuario.sub })),
    });
    const mudou = await tx.manutencao.updateMany({ where: { id, status: 'AGUARDANDO_ORCAMENTO' }, data: { status: 'ORCAMENTO_REGISTRADO' } });
    if (mudou.count === 0) throw new AppError('O chamado mudou de situação. Atualize a página.', 409);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao: 'ENVIAR_ORCAMENTO', entidade: 'manutencao', entidadeId: id, dadosDepois: { rodada: atual.rodadaOrcamento, arquivos: arquivos.length } },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoOrcamentoRegistrado(atualizada);
  return atualizada;
}

// O fiscal aprova o orçamento informando o valor aprovado: o chamado fica liberado para o prestador executar. O saldo do
// item é conferido por esse valor.
export async function aprovarOrcamento(usuario: AuthPayload, id: string, valor: number) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  const atualizada = await prisma.$transaction(async (tx) => {
    // A rodada é lida já com a linha travada: se o orçamento foi rejeitado e reenviado desde a leitura de cima, vale a rodada nova
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const { rodadaOrcamento } = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { rodadaOrcamento: true } });
    // O primeiro arquivo da rodada marca qual entrega foi aprovada (cotacaoAprovadaId)
    const entrega = await tx.cotacaoOrcamento.findFirst({ where: { manutencaoId: id, rodada: rodadaOrcamento }, orderBy: { enviadoEm: 'asc' } });
    if (!entrega) throw new AppError('Não há arquivos de orçamento na rodada atual.', 404);
    const vinculo = manutencao.contratoItemId
      ? await vincularItem(tx, manutencao.contratoItemId, id, { valorNovo: valor, novaSelecao: false, rotulo: 'orçamento aprovado' })
      : {};
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'ORCAMENTO_REGISTRADO' },
      data: { status: 'AGUARDANDO_EXECUCAO', cotacaoAprovadaId: entrega.id, orcamentoValor: valor, dataEnvio: new Date(), ...vinculo },
    });
    if (gravado.count === 0) throw new AppError('Não há orçamento aguardando decisão.', 409);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao: 'APROVAR_ORCAMENTO', entidade: 'manutencao', entidadeId: id, dadosAntes: { status: 'ORCAMENTO_REGISTRADO' }, dadosDepois: { status: 'AGUARDANDO_EXECUCAO', valor } },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoOrcamentoDecidido(atualizada, true, true);
  return atualizada;
}

// O fiscal não aceita o orçamento: o prestador envia uma nova entrega (nova rodada)
export async function rejeitarOrcamento(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao.tipo);
  const atualizada = await prisma.$transaction(async (tx) => {
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'ORCAMENTO_REGISTRADO' },
      data: { status: 'AGUARDANDO_ORCAMENTO', rodadaOrcamento: { increment: 1 }, motivoRejeicaoOrcamento: motivo },
    });
    if (gravado.count === 0) throw new AppError('Não há orçamento aguardando decisão.', 409);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao: 'REJEITAR_ORCAMENTO', entidade: 'manutencao', entidadeId: id, dadosAntes: { status: 'ORCAMENTO_REGISTRADO' }, dadosDepois: { status: 'AGUARDANDO_ORCAMENTO', motivo } },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoOrcamentoDecidido(atualizada, false, true);
  return atualizada;
}
