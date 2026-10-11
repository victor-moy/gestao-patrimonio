// Decisão do Gestor de Patrimônio: aprovar/negar, vínculo com ata, reserva de estoque e conclusão.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';
import { includePadrao, TIPOS_COM_ATA, tentarReservarDoEstoque, buscarGalpaoPadraoRecolha } from './solicitacoes.comum';
import { buscarPorId } from './solicitacoes.consulta';

// UC11/UC17/RN04 — aprovação pelo Gestor de Patrimônio. Para Ampliação e
// Substituição, o sistema decide sozinho se reserva do estoque de galpão ou
// se fica aguardando disponibilidade — o solicitante nunca vê ata/saldo
// (feedback do Gestor de Patrimônio: gestão de ata é assunto interno).
// `prioridade` (1–3) é definida pelo Gestor, não pelo solicitante, e usada
// depois pra ordenar quem atender primeiro quando chega estoque novo —
// obrigatória pra Ampliação/Substituição (feedback do cliente 18/08).
export async function aprovar(
  usuario: AuthPayload,
  id: string,
  prioridade?: number,
  etapaRecolha?: 'PATRIMONIO' | 'BRANET',
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }
  if (TIPOS_COM_ATA.includes(solicitacao.tipo) && !prioridade) {
    throw new AppError('Informe a prioridade da solicitação.', 422);
  }

  if (TIPOS_COM_ATA.includes(solicitacao.tipo)) {
    const atualizada = await prisma.$transaction(async (tx) => {
      const pool = await tentarReservarDoEstoque(
        tx,
        solicitacao.tipoEquipamentoId!,
        solicitacao.quantidade!,
      );
      const novoStatus = pool ? 'RESERVADO' : 'AGUARDANDO_DISPONIBILIDADE';
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: novoStatus, decididoPorId: usuario.sub, prioridade },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_SOLICITACAO',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { status: s.status, reservadoDoEstoque: Boolean(pool) },
        },
        tx,
      );
      return s;
    });
    await notificar(
      atualizada.unidadeOrigem.emailBase,
      'Solicitação aprovada',
      `Sua solicitação foi aprovada pelo Patrimônio. Você será notificado quando o item estiver pronto para entrega.`,
    );
    return atualizada;
  }

  if (solicitacao.tipo === 'EMPRESTIMO') {
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: 'AGUARDANDO_SAIDA', decididoPorId: usuario.sub },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_EMPRESTIMO',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { status: s.status },
        },
        tx,
      );
      return s;
    });
    await notificar(
      atualizada.unidadeOrigem.emailBase,
      'Empréstimo aprovado',
      `O empréstimo do equipamento ${atualizada.equipamento?.tombamento} para ${atualizada.unidadeDestino?.nome} foi aprovado. Confirme a saída do equipamento.`,
    );
    return atualizada;
  }

  if (solicitacao.tipo === 'RECOLHA') {
    // Ao aprovar, o Gestor escolhe direto em qual das duas etapas a recolha
    // já está — pode ir direto pra "Branet", pulando "Patrimônio" — em vez
    // de escolher um galpão (feedback do cliente 27/08).
    if (etapaRecolha !== 'PATRIMONIO' && etapaRecolha !== 'BRANET') {
      throw new AppError('Informe se a recolha está aguardando o Patrimônio ou já foi lançada no Branet.', 422);
    }
    const galpao = await buscarGalpaoPadraoRecolha();
    const pedidoEntregaRegistradoEm = etapaRecolha === 'BRANET' ? new Date() : null;
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: {
          status: 'AGUARDANDO_ENTREGA',
          decididoPorId: usuario.sub,
          unidadeDestinoId: galpao.id,
          pedidoEntregaRegistradoEm,
        },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_RECOLHA',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { status: s.status, etapaRecolha },
        },
        tx,
      );
      return s;
    });
    await notificar(
      atualizada.unidadeOrigem.emailBase,
      'Recolha aprovada',
      `A recolha do equipamento ${atualizada.equipamento?.tombamento} foi aprovada. Aguarde o Patrimônio providenciar a busca.`,
    );
    return atualizada;
  }

  throw new AppError('Esta solicitação não passa por aprovação do Gestor de Patrimônio.', 422);
}

// Bloqueio pessimista da linha da ata (SELECT ... FOR UPDATE) dentro da transação.
export async function lockAta(tx: Prisma.TransactionClient, ataId: string) {
  await tx.$queryRaw`SELECT id FROM ata WHERE id = ${ataId} FOR UPDATE`;
}

// UC17/RF29/RN08/RN09 — vínculo com ata: valida vencimento e saldo. Só entra
// em jogo quando não havia estoque para reservar de cara (AGUARDANDO_DISPONIBILIDADE).
// O item vem de compra, então não passa pelo pool de EstoqueGalpao.
export async function vincularAta(
  usuario: AuthPayload,
  id: string,
  ataId: string,
  valorVinculado?: number,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'AGUARDANDO_DISPONIBILIDADE') {
    throw new AppError('Esta solicitação não está aguardando disponibilidade.', 422);
  }
  if (!TIPOS_COM_ATA.includes(solicitacao.tipo)) {
    throw new AppError('Somente solicitações de ampliação ou substituição são vinculadas a atas.', 422);
  }
  const valor = valorVinculado ?? 0;
  if (valor <= 0) {
    throw new AppError('Informe o valor estimado da aquisição para vincular à ata.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    // Trava a linha da ata até o fim da transação: vínculos simultâneos à mesma
    // ata são serializados e o saldo comprometido abaixo é sempre o atual.
    await lockAta(tx, ataId);
    const ata = await tx.ata.findUnique({ where: { id: ataId } });
    if (!ata || !ata.ativo) throw new AppError('Ata não encontrada ou inativa.', 404);
    // RN08 — ata vencida não pode ser vinculada
    if (ata.vencimento < new Date()) {
      throw new AppError(`A ata ${ata.numero} está vencida e não pode ser vinculada a novas solicitações.`, 422);
    }
    // RN09 — o saldo não pode ficar negativo. O consumo só acontece no
    // lançamento do pedido no Branet, então o que já está vinculado e ainda
    // RESERVADO precisa ser descontado do saldo disponível.
    const comprometido = await tx.solicitacao.aggregate({
      _sum: { valorVinculado: true },
      where: { ataId, status: 'RESERVADO', id: { not: id } },
    });
    const disponivel = Number(ata.saldo) - Number(comprometido?._sum?.valorVinculado ?? 0);
    if (disponivel < valor) {
      throw new AppError(
        `Saldo insuficiente na ata ${ata.numero} (disponível R$ ${disponivel.toFixed(2)}).`,
        422,
      );
    }
    const s = await tx.solicitacao.update({
      where: { id },
      data: {
        status: 'RESERVADO',
        ataId,
        valorVinculado: valor,
        decididoPorId: usuario.sub,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'APROVAR_COM_ATA',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: s.status, ataId, valorVinculado: valor },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Solicitação em andamento',
    `Sua solicitação avançou — o item já está garantido e será entregue em breve.`,
  );
  return atualizada;
}

// Retry manual pra quem está em AGUARDANDO_DISPONIBILIDADE sem precisar de
// ata nova (ex.: chegou estoque via /estoque/entrada). Priorização entre
// pedidos concorrentes é decisão manual do Gestor — ele escolhe em qual
// solicitação tentar reservar primeiro.
export async function tentarReservarEstoque(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'AGUARDANDO_DISPONIBILIDADE') {
    throw new AppError('Esta solicitação não está aguardando disponibilidade.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const pool = await tentarReservarDoEstoque(
      tx,
      solicitacao.tipoEquipamentoId!,
      solicitacao.quantidade!,
    );
    if (!pool) {
      throw new AppError('Ainda não há estoque suficiente para reservar esta solicitação.', 422);
    }
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'RESERVADO' },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'RESERVAR_DO_ESTOQUE',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: s.status, galpaoId: pool.unidadeId },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Solicitação em andamento',
    `Sua solicitação avançou — o item já está garantido e será entregue em breve.`,
  );
  return atualizada;
}

// Validação final do Gestor de Patrimônio, depois que a unidade já
// confirmou o recebimento (feedback do cliente: não fecha sozinho).
export async function concluirSolicitacao(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  const tiposComValidacaoFinal = [...TIPOS_COM_ATA, 'RECOLHA'];
  if (!tiposComValidacaoFinal.includes(solicitacao.tipo) || solicitacao.status !== 'AGUARDANDO_VALIDACAO') {
    throw new AppError('Esta solicitação não está aguardando validação do Patrimônio.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    // Recolha: só agora, na validação final do Gestor, o equipamento muda de
    // unidade — o galpão já foi escolhido na aprovação (feedback 26/08).
    if (solicitacao.tipo === 'RECOLHA') {
      const galpaoId = solicitacao.unidadeDestinoId!;
      await tx.equipamento.update({
        where: { id: solicitacao.equipamentoId! },
        data: { unidadeId: galpaoId },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: solicitacao.equipamentoId!,
          tipo: 'RECOLHA',
          descricao: `Equipamento recolhido ao galpão a partir de ${solicitacao.unidadeOrigem.nome}`,
          unidadeOrigemId: solicitacao.unidadeOrigemId,
          unidadeDestinoId: galpaoId,
          usuarioId: usuario.sub,
        },
      });
    }
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'VALIDAR_CONCLUSAO_SOLICITACAO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: s.status },
      },
      tx,
    );
    return s;
  });
  return atualizada;
}

// FA03 — negação com motivo. Só antes da aprovação: uma vez aprovada (e
// portanto em AGUARDANDO_DISPONIBILIDADE ou além), não pode mais ser negada
// (feedback do cliente 18/08 — "uma vez aprovada está aprovada").
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser negadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'NEGADA', motivoNegacao: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'NEGAR_SOLICITACAO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosAntes: { status: solicitacao.status },
        dadosDepois: { status: 'NEGADA', motivo },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Solicitação negada',
    `Sua solicitação foi negada. Motivo: ${motivo}`,
  );
  return atualizada;
}
