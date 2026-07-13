import { EstadoConservacao, OrigemRecurso, Prisma, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';

const includePadrao = {
  unidadeOrigem: { select: { id: true, nome: true, emailBase: true } },
  unidadeDestino: { select: { id: true, nome: true, emailBase: true } },
  equipamento: {
    select: { id: true, tombamento: true, descricao: true, status: true, emendaParlamentar: true },
  },
  tipoEquipamento: { select: { id: true, nome: true, codigo: true } },
  ata: { select: { id: true, numero: true, saldo: true, vencimento: true } },
  criadoPor: { select: { nome: true } },
  decididoPor: { select: { nome: true } },
} satisfies Prisma.SolicitacaoInclude;

export async function listar(usuario: AuthPayload, filtros: { tipo?: string; status?: string; busca?: string }) {
  const where: Prisma.SolicitacaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE'
      ? {
          OR: [
            { unidadeOrigemId: usuario.unidadeId ?? '' },
            { unidadeDestinoId: usuario.unidadeId ?? '' },
          ],
        }
      : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo as never } : {}),
    ...(filtros.status ? { status: filtros.status as never } : {}),
    ...(filtros.busca
      ? {
          OR: [
            { justificativa: { contains: filtros.busca, mode: 'insensitive' as const } },
            { equipamento: { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { tipoEquipamento: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidadeOrigem: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
  return prisma.solicitacao.findMany({
    where,
    include: includePadrao,
    orderBy: { criadoEm: 'desc' },
  });
}

export async function buscarPorId(usuario: AuthPayload, id: string) {
  const solicitacao = await prisma.solicitacao.findUnique({
    where: { id },
    include: includePadrao,
  });
  if (!solicitacao) throw new AppError('Solicitação não encontrada.', 404);
  if (
    usuario.perfil === 'UNIDADE' &&
    solicitacao.unidadeOrigemId !== usuario.unidadeId &&
    solicitacao.unidadeDestinoId !== usuario.unidadeId
  ) {
    throw new AppError('Esta solicitação não envolve a sua unidade.', 403);
  }
  return solicitacao;
}

export interface DadosCriacao {
  tipo: TipoSolicitacao;
  justificativa: string;
  equipamentoId?: string;
  unidadeDestinoId?: string;
  tipoEquipamentoId?: string;
  quantidade?: number;
  origemRecurso?: OrigemRecurso;
  dataRetornoPrevista?: Date;
}

// UC10/UC13/UC16 + recolha (feedback 12/05/2026)
export async function criar(usuario: AuthPayload, dados: DadosCriacao) {
  if (!usuario.unidadeId) {
    throw new AppError('Usuário não está vinculado a uma unidade.', 403);
  }
  const unidadeOrigemId = usuario.unidadeId;

  if (dados.tipo === 'NOVO_ITEM') {
    if (!dados.tipoEquipamentoId || !dados.quantidade || !dados.origemRecurso) {
      throw new AppError('Novo item exige tipo de equipamento, quantidade e origem do recurso.', 422);
    }
    const solicitacao = await prisma.solicitacao.create({
      data: {
        tipo: 'NOVO_ITEM',
        unidadeOrigemId,
        tipoEquipamentoId: dados.tipoEquipamentoId,
        quantidade: dados.quantidade,
        justificativa: dados.justificativa,
        origemRecurso: dados.origemRecurso,
        criadoPorId: usuario.sub,
      },
      include: includePadrao,
    });
    return solicitacao;
  }

  // Demais tipos exigem um equipamento do inventário da própria unidade
  if (!dados.equipamentoId) {
    throw new AppError('Informe o equipamento da solicitação.', 422);
  }
  const equipamento = await prisma.equipamento.findUnique({
    where: { id: dados.equipamentoId },
  });
  if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
  if (equipamento.unidadeId !== unidadeOrigemId) {
    throw new AppError('Só é possível abrir solicitações para equipamentos do inventário da sua unidade.', 403);
  }
  // RN02/FA07 — equipamento em manutenção não pode ser cedido/emprestado/baixado
  if (equipamento.status !== 'ATIVO') {
    throw new AppError(
      `O equipamento está com status ${equipamento.status} e não pode ser movimentado até o encerramento do ciclo atual.`,
      422,
    );
  }

  if (dados.tipo === 'CESSAO_USO') {
    if (!dados.unidadeDestinoId) throw new AppError('Informe a unidade de destino da cessão.', 422);
    if (dados.unidadeDestinoId === unidadeOrigemId) {
      throw new AppError('A unidade de destino deve ser diferente da unidade de origem.', 422);
    }
    return prisma.solicitacao.create({
      data: {
        tipo: 'CESSAO_USO',
        unidadeOrigemId,
        unidadeDestinoId: dados.unidadeDestinoId,
        equipamentoId: equipamento.id,
        justificativa: dados.justificativa,
        criadoPorId: usuario.sub,
      },
      include: includePadrao,
    });
  }

  if (dados.tipo === 'EMPRESTIMO') {
    if (!dados.unidadeDestinoId) throw new AppError('Informe a unidade de destino do empréstimo.', 422);
    if (dados.unidadeDestinoId === unidadeOrigemId) {
      throw new AppError('A unidade de destino deve ser diferente da unidade de origem.', 422);
    }
    if (!dados.dataRetornoPrevista) {
      throw new AppError('Informe a data prevista de retorno do empréstimo.', 422);
    }
    // RN05 — empréstimo não requer aprovação do Gestor de Patrimônio.
    // RF25/RN06 — tombamento permanece na origem; destino é detentor temporário.
    const solicitacao = await prisma.$transaction(async (tx) => {
      const criada = await tx.solicitacao.create({
        data: {
          tipo: 'EMPRESTIMO',
          status: 'AGUARDANDO_RECEBIMENTO',
          unidadeOrigemId,
          unidadeDestinoId: dados.unidadeDestinoId,
          equipamentoId: equipamento.id,
          justificativa: dados.justificativa,
          dataRetornoPrevista: dados.dataRetornoPrevista,
          criadoPorId: usuario.sub,
        },
        include: includePadrao,
      });
      await tx.equipamento.update({
        where: { id: equipamento.id },
        data: { status: 'EMPRESTADO', unidadeTemporariaId: dados.unidadeDestinoId },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: equipamento.id,
          tipo: 'EMPRESTIMO',
          descricao: `Empréstimo registrado com retorno previsto para ${dados.dataRetornoPrevista!.toLocaleDateString('pt-BR')}`,
          unidadeOrigemId,
          unidadeDestinoId: dados.unidadeDestinoId,
          usuarioId: usuario.sub,
        },
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'REGISTRAR_EMPRESTIMO',
          entidade: 'solicitacao',
          entidadeId: criada.id,
          dadosDepois: { equipamentoId: equipamento.id, destino: dados.unidadeDestinoId },
        },
        tx,
      );
      return criada;
    });
    await notificar(
      solicitacao.unidadeDestino?.emailBase,
      'Empréstimo de equipamento registrado',
      `A unidade ${solicitacao.unidadeOrigem.nome} registrou o empréstimo do equipamento ${solicitacao.equipamento?.tombamento} para a sua unidade. Registre a avaliação do estado no recebimento.`,
    );
    return solicitacao;
  }

  // RECOLHA — a unidade pede que o galpão recolha o equipamento
  return prisma.solicitacao.create({
    data: {
      tipo: 'RECOLHA',
      unidadeOrigemId,
      equipamentoId: equipamento.id,
      justificativa: dados.justificativa,
      criadoPorId: usuario.sub,
    },
    include: includePadrao,
  });
}

// UC11/UC17/RN04 — aprovação pelo Gestor de Patrimônio
export async function aprovar(
  usuario: AuthPayload,
  id: string,
  dados: { ataId?: string; valorVinculado?: number },
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }

  if (solicitacao.tipo === 'NOVO_ITEM') {
    // FA04 — sem ata disponível: aprovada aguardando ata
    if (!dados.ataId) {
      const atualizada = await prisma.$transaction(async (tx) => {
        const s = await tx.solicitacao.update({
          where: { id },
          data: { status: 'APROVADA_AGUARDANDO_ATA', decididoPorId: usuario.sub },
          include: includePadrao,
        });
        await registrarAuditoria(
          {
            usuarioId: usuario.sub,
            acao: 'APROVAR_SOLICITACAO_SEM_ATA',
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
        'Solicitação aprovada — aguardando ata',
        `Sua solicitação de novo item foi aprovada e aguarda a disponibilidade de uma ata de registro de preços.`,
      );
      return atualizada;
    }
    return vincularAta(usuario, id, dados.ataId, dados.valorVinculado);
  }

  if (solicitacao.tipo === 'CESSAO_USO') {
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: 'AGUARDANDO_SAIDA', decididoPorId: usuario.sub },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_CESSAO',
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
      'Cessão de uso aprovada',
      `A cessão do equipamento ${atualizada.equipamento?.tombamento} para ${atualizada.unidadeDestino?.nome} foi aprovada. Confirme a saída do equipamento.`,
    );
    return atualizada;
  }

  if (solicitacao.tipo === 'RECOLHA') {
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: { status: 'AGUARDANDO_ENTREGA', decididoPorId: usuario.sub },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_RECOLHA',
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
      'Recolha aprovada',
      `A recolha do equipamento ${atualizada.equipamento?.tombamento} foi aprovada. O galpão confirmará o recebimento.`,
    );
    return atualizada;
  }

  throw new AppError('Empréstimos não passam por aprovação do Gestor de Patrimônio (RN05).', 422);
}

// UC17/RF29/RN08/RN09 — vínculo com ata: valida vencimento e saldo
export async function vincularAta(
  usuario: AuthPayload,
  id: string,
  ataId: string,
  valorVinculado?: number,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (!['PENDENTE_APROVACAO', 'APROVADA_AGUARDANDO_ATA'].includes(solicitacao.status)) {
    throw new AppError('Esta solicitação não está aguardando vínculo com ata.', 422);
  }
  if (solicitacao.tipo !== 'NOVO_ITEM') {
    throw new AppError('Somente solicitações de novo item são vinculadas a atas.', 422);
  }
  const ata = await prisma.ata.findUnique({ where: { id: ataId } });
  if (!ata || !ata.ativo) throw new AppError('Ata não encontrada ou inativa.', 404);
  // RN08 — ata vencida não pode ser vinculada
  if (ata.vencimento < new Date()) {
    throw new AppError(`A ata ${ata.numero} está vencida e não pode ser vinculada a novas solicitações.`, 422);
  }
  // RN09 — o saldo não pode ficar negativo
  const valor = valorVinculado ?? 0;
  if (valor <= 0) {
    throw new AppError('Informe o valor estimado da aquisição para vincular à ata.', 422);
  }
  if (Number(ata.saldo) < valor) {
    throw new AppError(
      `Saldo insuficiente na ata ${ata.numero} (disponível R$ ${Number(ata.saldo).toFixed(2)}).`,
      422,
    );
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: {
        status: 'APROVADA',
        ataId,
        valorVinculado: valor,
        decididoPorId: usuario.sub,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'APROVAR_NOVO_ITEM',
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
    'Solicitação de novo item aprovada',
    `Sua solicitação de novo item foi aprovada e vinculada à ata ${atualizada.ata?.numero}.`,
  );
  return atualizada;
}

// FA03 — negação com motivo
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (!['PENDENTE_APROVACAO', 'APROVADA_AGUARDANDO_ATA'].includes(solicitacao.status)) {
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

// UC12/RF22 — unidade de origem confirma a saída (cessão)
export async function confirmarSaida(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'CESSAO_USO' || solicitacao.status !== 'AGUARDANDO_SAIDA') {
    throw new AppError('Esta solicitação não está aguardando confirmação de saída.', 422);
  }
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem confirma a saída.', 403);
  }
  return prisma.solicitacao.update({
    where: { id },
    data: { status: 'AGUARDANDO_RECEBIMENTO' },
    include: includePadrao,
  });
}

// UC12/RF23 (cessão: transfere tombamento) e UC14/RF26 (empréstimo: avalia estado)
export async function confirmarRecebimento(
  usuario: AuthPayload,
  id: string,
  estadoRecebimento?: EstadoConservacao,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'AGUARDANDO_RECEBIMENTO') {
    throw new AppError('Esta solicitação não está aguardando recebimento.', 422);
  }
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeDestinoId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de destino confirma o recebimento.', 403);
  }

  if (solicitacao.tipo === 'CESSAO_USO') {
    const atualizada = await prisma.$transaction(async (tx) => {
      const s = await tx.solicitacao.update({
        where: { id },
        data: {
          status: 'CONCLUIDA',
          ...(estadoRecebimento ? { estadoRecebimento } : {}),
        },
        include: includePadrao,
      });
      // RF23 — atualiza automaticamente a localização do tombamento
      await tx.equipamento.update({
        where: { id: s.equipamentoId! },
        data: {
          unidadeId: s.unidadeDestinoId!,
          ...(estadoRecebimento ? { estadoConservacao: estadoRecebimento } : {}),
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: s.equipamentoId!,
          tipo: 'CESSAO_USO',
          descricao: `Cessão de uso concluída: ${s.unidadeOrigem.nome} → ${s.unidadeDestino?.nome}`,
          unidadeOrigemId: s.unidadeOrigemId,
          unidadeDestinoId: s.unidadeDestinoId,
          usuarioId: usuario.sub,
        },
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'CONCLUIR_CESSAO',
          entidade: 'solicitacao',
          entidadeId: id,
          dadosDepois: { equipamentoId: s.equipamentoId, novaUnidade: s.unidadeDestinoId },
        },
        tx,
      );
      return s;
    });
    await notificar(
      atualizada.unidadeOrigem.emailBase,
      'Cessão de uso concluída',
      `O equipamento ${atualizada.equipamento?.tombamento} foi recebido por ${atualizada.unidadeDestino?.nome}. O tombamento foi atualizado.`,
    );
    return atualizada;
  }

  if (solicitacao.tipo === 'EMPRESTIMO') {
    // UC14/RF26 — receptor registra o estado e assume responsabilidade
    if (!estadoRecebimento) {
      throw new AppError('Registre o estado do equipamento no recebimento.', 422);
    }
    return prisma.solicitacao.update({
      where: { id },
      data: { status: 'AGUARDANDO_RETORNO', estadoRecebimento },
      include: includePadrao,
    });
  }

  throw new AppError('Tipo de solicitação sem confirmação de recebimento.', 422);
}

// UC15/RF27 — unidade de origem confirma o retorno do empréstimo
export async function confirmarRetorno(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'EMPRESTIMO' || !['AGUARDANDO_RETORNO', 'AGUARDANDO_RECEBIMENTO'].includes(solicitacao.status)) {
    throw new AppError('Este empréstimo não está aguardando retorno.', 422);
  }
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeOrigemId !== usuario.unidadeId) {
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

// UC18/RF30 — galpão registra a entrada física + cadastro com tombamento
export async function registrarEntrada(
  usuario: AuthPayload,
  id: string,
  itens: Array<{
    tombamento: string;
    descricao: string;
    estadoConservacao: EstadoConservacao;
    dataAquisicao?: Date;
  }>,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'NOVO_ITEM' || solicitacao.status !== 'APROVADA') {
    throw new AppError('Somente solicitações de novo item aprovadas recebem entrada no galpão.', 422);
  }
  if (itens.length === 0) throw new AppError('Informe ao menos um item recebido.', 422);
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
          estadoConservacao: item.estadoConservacao,
          emendaParlamentar: solicitacao.origemRecurso === 'EMENDA_PARLAMENTAR',
          dataAquisicao: item.dataAquisicao ?? new Date(),
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: equipamento.id,
          tipo: 'RECEBIMENTO_GALPAO',
          descricao: `Entrada registrada no galpão e destinada à unidade ${solicitacao.unidadeOrigem.nome}`,
          unidadeDestinoId: solicitacao.unidadeOrigemId,
          usuarioId: usuario.sub,
        },
      });
    }
    // Consumo do saldo da ata no recebimento do bem (feedback 12/05/2026)
    if (solicitacao.ataId && solicitacao.valorVinculado) {
      const ata = await tx.ata.findUnique({ where: { id: solicitacao.ataId } });
      if (ata) {
        const novoSaldo = Number(ata.saldo) - Number(solicitacao.valorVinculado);
        // RN09 — nunca negativo
        await tx.ata.update({
          where: { id: ata.id },
          data: { saldo: Math.max(0, novoSaldo) },
        });
      }
    }
    // Atualiza estoque do galpão (RF31)
    await tx.estoqueGalpao.upsert({
      where: { tipoEquipamentoId: solicitacao.tipoEquipamentoId! },
      create: {
        tipoEquipamentoId: solicitacao.tipoEquipamentoId!,
        quantidade: itens.length,
        ultimaEntradaEm: new Date(),
      },
      update: {
        quantidade: { increment: itens.length },
        ultimaEntradaEm: new Date(),
      },
    });
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REGISTRAR_ENTRADA_NOVO_ITEM',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { tombamentos: itens.map((i) => i.tombamento) },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Novo item recebido',
    `Os itens da sua solicitação foram recebidos no galpão e cadastrados com tombamento.`,
  );
  return atualizada;
}

// Conclusão da recolha — galpão confirma o recebimento físico
export async function confirmarRecolha(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'RECOLHA' || solicitacao.status !== 'AGUARDANDO_ENTREGA') {
    throw new AppError('Esta recolha não está aguardando confirmação do galpão.', 422);
  }
  const galpao = await prisma.unidade.findFirst({ where: { tipo: 'GALPAO', ativo: true } });
  if (!galpao) throw new AppError('Nenhuma unidade do tipo galpão está cadastrada.', 422);
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: { unidadeId: galpao.id },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'RECOLHA',
        descricao: `Equipamento recolhido ao galpão a partir de ${s.unidadeOrigem.nome}`,
        unidadeOrigemId: s.unidadeOrigemId,
        unidadeDestinoId: galpao.id,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONCLUIR_RECOLHA',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { equipamentoId: s.equipamentoId, galpaoId: galpao.id },
      },
      tx,
    );
    return s;
  });
  return atualizada;
}
