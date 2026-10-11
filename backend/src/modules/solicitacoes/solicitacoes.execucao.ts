// Execução do fluxo depois da aprovação: saída, recebimento, retorno, lançamento no Branet, recolha, anexo e ajuste de tombamento.

import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';
import { includePadrao, TIPOS_COM_ATA } from './solicitacoes.comum';
import { buscarPorId } from './solicitacoes.consulta';
import { lockAta } from './solicitacoes.decisao';

// UC12/RF22 — unidade de origem confirma a saída física do equipamento do
// empréstimo. É só nesse momento que o equipamento passa a contar no
// inventário da unidade de destino (RN06) — antes disso (durante a
// aprovação do Gestor) o item continua normalmente na origem.
export async function confirmarSaida(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'EMPRESTIMO' || solicitacao.status !== 'AGUARDANDO_SAIDA') {
    throw new AppError('Esta solicitação não está aguardando confirmação de saída.', 422);
  }
  // Só a unidade de origem confirma — nem o Gestor de Patrimônio pode fazer
  // isso por ela (mesmo padrão de confirmar-recolha).
  if (usuario.perfil !== 'UNIDADE' || solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem confirma a saída.', 403);
  }

  // Fica "emprestado" (AGUARDANDO_RETORNO) até a origem confirmar o
  // retorno — não existe mais transferência permanente.
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'AGUARDANDO_RETORNO' },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: { status: 'EMPRESTADO', unidadeTemporariaId: s.unidadeDestinoId },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'EMPRESTIMO',
        descricao: `Empréstimo iniciado: ${s.unidadeOrigem.nome} → ${s.unidadeDestino?.nome}`,
        unidadeOrigemId: s.unidadeOrigemId,
        unidadeDestinoId: s.unidadeDestinoId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONFIRMAR_SAIDA_EMPRESTIMO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: s.status, equipamentoId: s.equipamentoId },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeDestino?.emailBase,
    'Empréstimo iniciado',
    `O equipamento ${atualizada.equipamento?.tombamento} chegou como empréstimo da unidade ${atualizada.unidadeOrigem.nome} e já está no inventário da sua unidade.`,
  );
  return atualizada;
}

export interface DadosConfirmarRecebimento {
  // Ampliação/Substituição (feedback do cliente 17/08): OK/Não OK binário.
  // Se OK, exige o tombamento de cada item pra comparar com o cadastrado.
  ok?: boolean;
  observacao?: string;
  itens?: Array<{ equipamentoId: string; tombamentoConfirmado: string }>;
}

// Ampliação/Substituição: a unidade de origem confirma o recebimento do item
// (que já tem tombamento desde que o Gestor lançou no Branet) — não conclui
// sozinha, só avança pra validação final do Patrimônio (feedback do cliente).
export async function confirmarRecebimento(
  usuario: AuthPayload,
  id: string,
  dados: DadosConfirmarRecebimento,
) {
  const solicitacao = await buscarPorId(usuario, id);

  if (TIPOS_COM_ATA.includes(solicitacao.tipo)) {
    if (solicitacao.status !== 'AGUARDANDO_ENTREGA') {
      throw new AppError('Esta solicitação não está aguardando recebimento.', 422);
    }
    // Só a Unidade solicitante confirma — nem o Gestor de Patrimônio pode
    // fazer isso por ela (feedback do cliente 18/08).
    if (usuario.perfil !== 'UNIDADE' || solicitacao.unidadeOrigemId !== usuario.unidadeId) {
      throw new AppError('Somente a unidade solicitante confirma o recebimento.', 403);
    }
    if (dados.ok === undefined) {
      throw new AppError('Informe se o item chegou OK ou Não OK.', 422);
    }

    let recebimentoOk = dados.ok;
    let observacaoRecebimento = dados.observacao?.trim() || null;

    if (!dados.ok) {
      if (!observacaoRecebimento) {
        throw new AppError('Informe uma observação explicando o que não está OK.', 422);
      }
    } else {
      if (!dados.itens || dados.itens.length !== solicitacao.itensGerados.length) {
        throw new AppError(
          `Confirme o tombamento de todos os ${solicitacao.itensGerados.length} item(ns) da solicitação.`,
          422,
        );
      }
      const esperadoPorId = new Map(solicitacao.itensGerados.map((eq) => [eq.id, eq.tombamento]));
      const divergencias: string[] = [];
      for (const item of dados.itens) {
        const esperado = esperadoPorId.get(item.equipamentoId);
        if (!esperado) {
          throw new AppError('Item informado não pertence a esta solicitação.', 422);
        }
        if (esperado.trim() !== item.tombamentoConfirmado.trim()) {
          divergencias.push(`esperado ${esperado}, informado ${item.tombamentoConfirmado}`);
        }
      }
      // Tombamento não bate com o cadastrado ao lançar no Branet: trata como
      // anomalia automaticamente, mesmo que a Unidade tenha marcado "OK"
      if (divergencias.length > 0) {
        recebimentoOk = false;
        observacaoRecebimento = `Divergência de patrimônio: ${divergencias.join('; ')}.`;
      }
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      // Nota: Ampliação pode gerar vários equipamentos (quantidade > 1) e
      // Substituição já usa equipamentoId pro item antigo baixado — por
      // isso o resultado da conferência fica só registrado na solicitação.
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: 'AGUARDANDO_VALIDACAO', recebimentoOk, observacaoRecebimento },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'CONFIRMAR_RECEBIMENTO_ITEM',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { status: s.status, recebimentoOk, observacaoRecebimento },
        },
        tx,
      );
      return s;
    });
    return atualizada;
  }

  throw new AppError('Esta solicitação não está aguardando recebimento.', 422);
}

// UC15/RF27 — unidade de origem confirma o retorno do empréstimo
export async function confirmarRetorno(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'EMPRESTIMO' || solicitacao.status !== 'AGUARDANDO_RETORNO') {
    throw new AppError('Este empréstimo não está aguardando retorno.', 422);
  }
  // Só a unidade de origem confirma — nem o Gestor de Patrimônio pode fazer
  // isso por ela.
  if (usuario.perfil !== 'UNIDADE' || solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem confirma o retorno do empréstimo.', 403);
  }
  // FA05 — atraso é registrado no histórico, sem bloqueio
  const atrasado =
    solicitacao.dataRetornoPrevista !== null && solicitacao.dataRetornoPrevista < new Date();
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: { status: 'ATIVO', unidadeTemporariaId: null },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'DEVOLUCAO_EMPRESTIMO',
        descricao: `Empréstimo encerrado — equipamento devolvido a ${s.unidadeOrigem.nome}${atrasado ? ' (devolução após o prazo previsto)' : ''}`,
        unidadeOrigemId: s.unidadeDestinoId,
        unidadeDestinoId: s.unidadeOrigemId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONCLUIR_EMPRESTIMO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: 'CONCLUIDA', atrasado },
      },
      tx,
    );
    return s;
  });
  return atualizada;
}

// Gestor de Patrimônio marca que o pedido foi lançado no Branet — registro
// manual, sem integração real — informando o número do pedido e o tombamento
// de cada item (Ampliação: item novo; Substituição: item novo + baixa do
// antigo). Absorve o que antes era uma etapa separada do Galpão (feedback do
// cliente 17/08: quem lida com o Branet e o tombamento é o Gestor, não o Galpão).
// Cessão de Uso reserva do estoque na própria criação (sem etapa de Ata) —
// aqui só registra o número do pedido e já conclui direto, sem gerar
// tombamento novo, já que o destino é externo e não é rastreado no
// inventário.
export async function marcarLancadoBranet(
  usuario: AuthPayload,
  id: string,
  numeroPedidoBranet: string,
  itens: Array<{ tombamento: string; descricao: string; dataAquisicao?: Date }>,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (![...TIPOS_COM_ATA, 'CESSAO_USO'].includes(solicitacao.tipo) || solicitacao.status !== 'RESERVADO') {
    throw new AppError(
      'Somente solicitações de ampliação, substituição ou cessão de uso reservadas podem ser marcadas como lançadas no Branet.',
      422,
    );
  }

  if (solicitacao.tipo === 'CESSAO_USO') {
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: 'CONCLUIDA', numeroPedidoBranet, pedidoEntregaRegistradoEm: new Date() },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'MARCAR_LANCADO_BRANET',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { status: s.status, numeroPedidoBranet },
        },
        tx,
      );
      return s;
    });
    return atualizada;
  }

  if (itens.length !== solicitacao.quantidade) {
    throw new AppError(`Informe o tombamento de todos os ${solicitacao.quantidade} item(ns) da solicitação.`, 422);
  }
  const duplicados = await prisma.equipamento.findMany({
    where: { tombamento: { in: itens.map((i) => i.tombamento) } },
    select: { tombamento: true },
  });
  if (duplicados.length > 0) {
    throw new AppError(
      `Tombamentos já cadastrados: ${duplicados.map((d) => d.tombamento).join(', ')}.`,
      409,
    );
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    for (const item of itens) {
      const equipamento = await tx.equipamento.create({
        data: {
          tombamento: item.tombamento,
          descricao: item.descricao,
          tipoEquipamentoId: solicitacao.tipoEquipamentoId!,
          unidadeId: solicitacao.unidadeOrigemId,
          // Ainda não inspecionado fisicamente pelo Gestor nesse momento —
          // a Unidade confirma/ajusta no recebimento (RF novo, feedback 17/08)
          estadoConservacao: 'BOM',
          emendaParlamentar: solicitacao.origemRecurso === 'EMENDA_PARLAMENTAR',
          dataAquisicao: item.dataAquisicao ?? new Date(),
          criadoPorSolicitacaoId: id,
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: equipamento.id,
          tipo: 'RECEBIMENTO_GALPAO',
          descricao: `Pedido ${numeroPedidoBranet} lançado no Branet, destinado à unidade ${solicitacao.unidadeOrigem.nome}`,
          unidadeDestinoId: solicitacao.unidadeOrigemId,
          usuarioId: usuario.sub,
        },
      });
    }
    // Substituição: baixa o equipamento antigo (se ainda não baixado — RN07
    // já baixa automaticamente antes de criar a solicitação)
    if (solicitacao.tipo === 'SUBSTITUICAO' && solicitacao.equipamento && solicitacao.equipamento.status !== 'BAIXADO') {
      await tx.equipamento.update({
        where: { id: solicitacao.equipamento.id },
        data: { status: 'BAIXADO', motivoBaixa: 'SUBSTITUICAO' },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: solicitacao.equipamento.id,
          tipo: 'BAIXA',
          descricao: `Baixa por substituição — pedido ${numeroPedidoBranet} lançado no Branet`,
          unidadeOrigemId: solicitacao.unidadeOrigemId,
          usuarioId: usuario.sub,
        },
      });
    }
    // Consumo do saldo da ata no lançamento do pedido (feedback 12/05/2026)
    if (solicitacao.ataId && solicitacao.valorVinculado) {
      await lockAta(tx, solicitacao.ataId);
      // RN09 — débito condicional: nunca deixa o saldo negativo nem mascara a falta com Math.max
      const { count } = await tx.ata.updateMany({
        where: { id: solicitacao.ataId, saldo: { gte: solicitacao.valorVinculado } },
        data: { saldo: { decrement: solicitacao.valorVinculado } },
      });
      if (count !== 1) {
        throw new AppError('Saldo insuficiente na ata para lançar este pedido.', 422);
      }
    }
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'AGUARDANDO_ENTREGA', numeroPedidoBranet, pedidoEntregaRegistradoEm: new Date() },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'MARCAR_LANCADO_BRANET',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { status: s.status, numeroPedidoBranet, tombamentos: itens.map((i) => i.tombamento) },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Item pronto para entrega',
    `Seu pedido foi lançado no Branet e o tombamento já foi reservado. Confirme o recebimento quando o item chegar.`,
  );
  return atualizada;
}

// Unidade de origem confirma que o equipamento realmente saiu (não é mais o
// galpão quem confirma — feedback do cliente 26/08, mesma lógica já aplicada
// à confirmação de recebimento: quem sabe o que realmente aconteceu é quem
// está na ponta). Só avança pra Aguardando Validação — quem move o
// equipamento de unidade e conclui é o Gestor, em concluirSolicitacao.
// A etapa (Patrimônio/Branet) é escolhida uma vez, na aprovação, e não muda
// depois — não é um pré-requisito pra confirmar (feedback do cliente 27/08).
export async function confirmarRecolha(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'RECOLHA' || solicitacao.status !== 'AGUARDANDO_ENTREGA') {
    throw new AppError('Esta recolha não está aguardando confirmação.', 422);
  }
  if (usuario.perfil !== 'UNIDADE' || solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem confirma a recolha.', 403);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'AGUARDANDO_VALIDACAO' },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONFIRMAR_RECOLHA',
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

// Anexo (opcional, qualquer tipo de solicitação) — PDF ou imagem
export async function anexarArquivo(usuario: AuthPayload, id: string, anexoUrl: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem pode anexar um arquivo a esta solicitação.', 403);
  }
  return prisma.solicitacao.update({
    where: { id },
    data: { anexoUrl },
    include: includePadrao,
  });
}

// Exceção estreita à RN01 (tombamento normalmente imutável): só os itens
// gerados por esta solicitação, e só enquanto ainda aguarda validação, podem
// ter o tombamento corrigido — resolve uma divergência apontada pela Unidade
// no recebimento antes do Gestor concluir (feedback do cliente 17/08).
export async function ajustarTombamento(
  usuario: AuthPayload,
  id: string,
  itens: Array<{ equipamentoId: string; tombamento: string; descricao?: string }>,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (!TIPOS_COM_ATA.includes(solicitacao.tipo) || solicitacao.status !== 'AGUARDANDO_VALIDACAO') {
    throw new AppError('Só é possível ajustar o tombamento enquanto a solicitação aguarda validação.', 422);
  }
  const idsValidos = new Set(solicitacao.itensGerados.map((eq) => eq.id));
  for (const item of itens) {
    if (!idsValidos.has(item.equipamentoId)) {
      throw new AppError('Item informado não pertence a esta solicitação.', 422);
    }
  }
  const novosTombamentos = itens.map((i) => i.tombamento);
  const duplicados = await prisma.equipamento.findMany({
    where: {
      tombamento: { in: novosTombamentos },
      id: { notIn: itens.map((i) => i.equipamentoId) },
    },
    select: { tombamento: true },
  });
  if (duplicados.length > 0) {
    throw new AppError(
      `Tombamentos já cadastrados em outro equipamento: ${duplicados.map((d) => d.tombamento).join(', ')}.`,
      409,
    );
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    for (const item of itens) {
      await tx.equipamento.update({
        where: { id: item.equipamentoId },
        data: { tombamento: item.tombamento, ...(item.descricao ? { descricao: item.descricao } : {}) },
      });
    }
    const s = await tx.solicitacao.update({ where: { id }, data: {}, include: includePadrao });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'AJUSTAR_TOMBAMENTO_SOLICITACAO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { itens },
      },
      tx,
    );
    return s;
  });
  return atualizada;
}
