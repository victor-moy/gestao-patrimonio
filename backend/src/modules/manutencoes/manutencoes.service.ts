import { EstadoConservacao, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';

const includePadrao = {
  equipamento: {
    include: { tipoEquipamento: { select: { nome: true } } },
  },
  unidade: { select: { id: true, nome: true, emailBase: true } },
  solicitante: { select: { nome: true } },
  decididoPor: { select: { nome: true } },
  contrato: { select: { id: true, empresa: true } },
} satisfies Prisma.ManutencaoInclude;

export async function listar(usuario: AuthPayload, filtros: { status?: string; busca?: string }) {
  const where: Prisma.ManutencaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE' ? { unidadeId: usuario.unidadeId ?? '' } : {}),
    ...(filtros.status ? { status: filtros.status as never } : {}),
    ...(filtros.busca
      ? {
          OR: [
            { equipamento: { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidade: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { descricaoProblema: { contains: filtros.busca, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  return prisma.manutencao.findMany({
    where,
    include: includePadrao,
    orderBy: { criadoEm: 'desc' },
  });
}

export async function buscarPorId(usuario: AuthPayload, id: string) {
  const manutencao = await prisma.manutencao.findUnique({
    where: { id },
    include: includePadrao,
  });
  if (!manutencao) throw new AppError('Manutenção não encontrada.', 404);
  if (usuario.perfil === 'UNIDADE' && manutencao.unidadeId !== usuario.unidadeId) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  return manutencao;
}

// UC05/RF11 — a Unidade abre solicitação de manutenção
export async function solicitar(
  usuario: AuthPayload,
  dados: { equipamentoId: string; descricaoProblema: string; justificativa: string },
) {
  const equipamento = await prisma.equipamento.findUnique({
    where: { id: dados.equipamentoId },
  });
  if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
  // Feedback 12/05/2026: a unidade só seleciona equipamentos do próprio inventário
  if (usuario.perfil === 'UNIDADE' && equipamento.unidadeId !== usuario.unidadeId) {
    throw new AppError('Só é possível solicitar manutenção para equipamentos da sua unidade.', 403);
  }
  // FA07/RN02 — status incompatível bloqueia antes de qualquer gravação
  if (equipamento.status !== 'ATIVO') {
    throw new AppError(
      `O equipamento está com status ${equipamento.status} e não pode receber nova solicitação de manutenção.`,
      422,
    );
  }
  return prisma.manutencao.create({
    data: {
      equipamentoId: equipamento.id,
      unidadeId: equipamento.unidadeId,
      solicitanteId: usuario.sub,
      descricaoProblema: dados.descricaoProblema,
      justificativa: dados.justificativa,
    },
    include: includePadrao,
  });
}

// UC06/RF12/RF13 — aprovação pelo Gestor de Manutenção (RN03)
export async function aprovar(usuario: AuthPayload, id: string, contratoId?: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'AGUARDANDO_ORCAMENTO',
        decididoPorId: usuario.sub,
        contratoId: contratoId ?? null,
        dataEnvio: new Date(),
      },
      include: includePadrao,
    });
    // RF13 — equipamento passa a "em manutenção"
    await tx.equipamento.update({
      where: { id: m.equipamentoId },
      data: { status: 'EM_MANUTENCAO' },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: m.equipamentoId,
        tipo: 'ENVIO_MANUTENCAO',
        descricao: `Manutenção aprovada — equipamento encaminhado para a terceirizada`,
        unidadeOrigemId: m.unidadeId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'APROVAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: m.status },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    'Manutenção aprovada',
    `A solicitação de manutenção do equipamento ${atualizada.equipamento.tombamento} foi aprovada e o equipamento será encaminhado para a terceirizada.`,
  );
  return atualizada;
}

// FA01 — negação com motivo; equipamento permanece ativo
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser negadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'NEGADA', motivoNegacao: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'NEGAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'NEGADA', motivo },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    'Manutenção negada',
    `A solicitação de manutenção do equipamento ${atualizada.equipamento.tombamento} foi negada. Motivo: ${motivo}`,
  );
  return atualizada;
}

// UC07/RF14 — registro do orçamento retornado pela terceirizada
export async function registrarOrcamento(
  usuario: AuthPayload,
  id: string,
  dados: { valor: number; descricao?: string; contratoId?: string },
) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'AGUARDANDO_ORCAMENTO') {
    throw new AppError('O orçamento só pode ser registrado quando a manutenção aguarda orçamento.', 422);
  }
  return prisma.manutencao.update({
    where: { id },
    data: {
      status: 'ORCAMENTO_REGISTRADO',
      orcamentoValor: dados.valor,
      orcamentoDescricao: dados.descricao ?? null,
      ...(dados.contratoId ? { contratoId: dados.contratoId } : {}),
    },
    include: includePadrao,
  });
}

// UC08/RF15 — validação do orçamento: aprova (executa) ou rejeita (laudo de baixa)
export async function validarOrcamento(
  usuario: AuthPayload,
  id: string,
  dados: { aprovado: boolean; laudoBaixa?: string },
) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'ORCAMENTO_REGISTRADO') {
    throw new AppError('Não há orçamento registrado aguardando validação.', 422);
  }
  if (dados.aprovado) {
    const m = await prisma.$transaction(async (tx) => {
      const atualizada = await tx.manutencao.update({
        where: { id },
        data: { status: 'EM_EXECUCAO' },
        include: includePadrao,
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'APROVAR_ORCAMENTO',
          entidade: 'manutencao',
          entidadeId: id,
          dadosDepois: { valor: manutencao.orcamentoValor },
        },
        tx,
      );
      return atualizada;
    });
    return m;
  }
  // FA02 — orçamento rejeitado: laudo de baixa obrigatório
  if (!dados.laudoBaixa) {
    throw new AppError('Para rejeitar o orçamento é obrigatório informar o laudo de baixa.', 422);
  }
  return emitirBaixa(usuario, manutencao.id, dados.laudoBaixa);
}

// RF16/RF17/RN07/FA02 — laudo de baixa + solicitação automática de novo item
export async function emitirBaixa(usuario: AuthPayload, id: string, laudo: string) {
  const manutencao = await prisma.manutencao.findUnique({
    where: { id },
    include: includePadrao,
  });
  if (!manutencao) throw new AppError('Manutenção não encontrada.', 404);
  if (['CONCLUIDA', 'NEGADA', 'BAIXADO'].includes(manutencao.status)) {
    throw new AppError('Esta manutenção já foi encerrada.', 422);
  }
  const resultado = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'BAIXADO',
        laudoBaixa: laudo,
        decididoPorId: usuario.sub,
        dataConclusao: new Date(),
      },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: m.equipamentoId },
      data: { status: 'BAIXADO' },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: m.equipamentoId,
        tipo: 'BAIXA',
        descricao: `Baixa por impossibilidade de manutenção. Laudo: ${laudo}`,
        unidadeOrigemId: m.unidadeId,
        usuarioId: usuario.sub,
      },
    });
    // RN07 — o Sistema abre automaticamente solicitação de novo item
    // em nome da unidade de origem do equipamento.
    const solicitacaoAutomatica = await tx.solicitacao.create({
      data: {
        tipo: 'NOVO_ITEM',
        status: 'PENDENTE_APROVACAO',
        unidadeOrigemId: m.unidadeId,
        tipoEquipamentoId: m.equipamento.tipoEquipamentoId,
        quantidade: 1,
        justificativa: `Substituição de equipamento baixado por impossibilidade de manutenção (tombamento ${m.equipamento.tombamento}). Solicitação gerada automaticamente pelo sistema.`,
        origemRecurso: 'REGULAR',
        automatica: true,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'EMITIR_LAUDO_BAIXA',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'BAIXADO', laudo, solicitacaoAutomaticaId: solicitacaoAutomatica.id },
      },
      tx,
    );
    return m;
  });
  // FA02 — o Gestor de Patrimônio é notificado da solicitação automática
  const gestores = await prisma.usuario.findMany({
    where: { perfil: 'GESTOR_PATRIMONIO', ativo: true },
    select: { email: true },
  });
  for (const gestor of gestores) {
    await notificar(
      gestor.email,
      'Solicitação automática de novo item',
      `O equipamento ${resultado.equipamento.tombamento} foi baixado por impossibilidade de manutenção e uma solicitação de novo item foi aberta automaticamente para a unidade ${resultado.unidade.nome}.`,
    );
  }
  await notificar(
    resultado.unidade.emailBase,
    'Equipamento baixado',
    `O equipamento ${resultado.equipamento.tombamento} foi baixado por impossibilidade de manutenção. Uma solicitação de novo item foi aberta automaticamente.`,
  );
  return resultado;
}

// Terceirizada devolveu o equipamento — aguarda a confirmação dupla
export async function registrarRetorno(usuario: AuthPayload, id: string, custoFinal?: number) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'EM_EXECUCAO') {
    throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
  }
  return prisma.manutencao.update({
    where: { id },
    data: {
      status: 'AGUARDANDO_RETORNO',
      custoFinal: custoFinal ?? manutencao.orcamentoValor,
    },
    include: includePadrao,
  });
}

// UC09/RF18/RN11 — confirmação dupla: Unidade + Gestor de Manutenção
export async function confirmarRetorno(
  usuario: AuthPayload,
  id: string,
  estadoPosManutencao?: EstadoConservacao,
) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'AGUARDANDO_RETORNO') {
    throw new AppError('Esta manutenção não está aguardando confirmação de retorno.', 422);
  }
  const dados: Prisma.ManutencaoUpdateInput = {};
  if (usuario.perfil === 'GESTOR_MANUTENCAO') {
    dados.confirmadoGestor = true;
  } else if (usuario.perfil === 'UNIDADE') {
    if (manutencao.unidadeId !== usuario.unidadeId) {
      throw new AppError('Somente a unidade do equipamento pode confirmar o retorno.', 403);
    }
    dados.confirmadoUnidade = true;
  } else {
    throw new AppError('Somente a Unidade e o Gestor de Manutenção confirmam retorno.', 403);
  }
  if (estadoPosManutencao) {
    dados.estadoPosManutencao = estadoPosManutencao;
  }

  const confirmadoUnidade = manutencao.confirmadoUnidade || dados.confirmadoUnidade === true;
  const confirmadoGestor = manutencao.confirmadoGestor || dados.confirmadoGestor === true;
  const ambosConfirmaram = confirmadoUnidade && confirmadoGestor;

  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        ...dados,
        ...(ambosConfirmaram
          ? { status: 'CONCLUIDA' as const, dataConclusao: new Date() }
          : {}),
      },
      include: includePadrao,
    });
    if (ambosConfirmaram) {
      // RF18/RF19 — equipamento volta a ativo com estado pós-serviço,
      // custo e data registrados no histórico.
      await tx.equipamento.update({
        where: { id: m.equipamentoId },
        data: {
          status: 'ATIVO',
          ...(m.estadoPosManutencao ? { estadoConservacao: m.estadoPosManutencao } : {}),
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: m.equipamentoId,
          tipo: 'RETORNO_MANUTENCAO',
          descricao: `Retorno de manutenção confirmado (custo R$ ${Number(m.custoFinal ?? 0).toFixed(2)})`,
          unidadeDestinoId: m.unidadeId,
          usuarioId: usuario.sub,
        },
      });
      await registrarAuditoria(
        {
          usuarioId: usuario.sub,
          acao: 'CONCLUIR_MANUTENCAO',
          entidade: 'manutencao',
          entidadeId: id,
          dadosDepois: { status: 'CONCLUIDA', custoFinal: m.custoFinal },
        },
        tx,
      );
    }
    return m;
  });
  return atualizada;
}
