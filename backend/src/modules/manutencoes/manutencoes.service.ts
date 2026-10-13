import { comprometidoPorItem, saldoDoItem } from '../contratos/saldo';
import { EstadoConservacao, Prisma, StatusManutencao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { numeroDaBusca } from '../../lib/numero';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';

const includePadrao = {
  equipamento: {
    include: {
      tipoEquipamento: {
        select: { nome: true, permitePreventiva: true, permiteCorretiva: true, preco: true },
      },
    },
  },
  unidade: { select: { id: true, nome: true, emailBase: true } },
  solicitante: { select: { nome: true } },
  decididoPor: { select: { nome: true } },
  contrato: { select: { id: true, numero: true, prestadorId: true, prestador: { select: { nome: true } } } },
  contratoItem: {
    select: { id: true, valor: true, servico: { select: { nome: true } }, escopo: { select: { nome: true } } },
  },
} satisfies Prisma.ManutencaoInclude;

// Perfis que existiam antes da unificação em Administrador (ainda presentes em registros de auditoria antigos)
const PERFIS_UNIFICADOS = ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO'];

export async function listar(usuario: AuthPayload, filtros: { status?: StatusManutencao; busca?: string }) {
  if (usuario.perfil === 'TERCEIRIZADA' && !usuario.prestadorId) return [];
  const prestadorId = usuario.prestadorId;
  const where: Prisma.ManutencaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE' ? { unidadeId: usuario.unidadeId ?? '' } : {}),
    // Terceirizada: só as manutenções cobertas por contratos do seu prestador (o prestador vem do token)
    ...(usuario.perfil === 'TERCEIRIZADA' && prestadorId ? { contrato: { prestadorId } } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.busca
      ? {
          OR: [
            ...(numeroDaBusca(filtros.busca, 'MAN') !== null ? [{ numero: numeroDaBusca(filtros.busca, 'MAN') as number }] : []),
            { equipamento: { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidade: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { descricaoProblema: { contains: filtros.busca, mode: 'insensitive' as const } },
            { titulo: { contains: filtros.busca, mode: 'insensitive' as const } },
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
  if (
    usuario.perfil === 'TERCEIRIZADA' &&
    (!usuario.prestadorId || manutencao.contrato?.prestadorId !== usuario.prestadorId)
  ) {
    throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
  }
  return manutencao;
}

// Linha do tempo da manutenção: abertura + ações auditadas. Expõe só ação,
// autor, data e o perfil de quem confirmou o retorno — nunca o payload bruto.
export async function historico(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  const logs = await prisma.logAuditoria.findMany({
    where: { entidade: 'manutencao', entidadeId: id },
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      acao: true,
      criadoEm: true,
      dadosDepois: true,
      usuario: { select: { nome: true } },
    },
  });
  return [
    {
      id: 'abertura',
      acao: 'ABRIR_MANUTENCAO',
      criadoEm: manutencao.criadoEm,
      usuario: manutencao.solicitante?.nome ?? null,
    },
    ...logs.map((log) => {
      const dados = (log.dadosDepois ?? {}) as { perfil?: unknown };
      return {
        id: log.id,
        acao: log.acao,
        criadoEm: log.criadoEm,
        usuario: log.usuario?.nome ?? null,
        // Registros antigos guardam os perfis que foram unificados em Administrador
        ...(typeof dados.perfil === 'string' ? { perfil: PERFIS_UNIFICADOS.includes(dados.perfil) ? 'OPERADOR' : dados.perfil } : {}),
      };
    }),
  ];
}

// UC05/RF11 — a Unidade abre solicitação de manutenção
export async function solicitar(
  usuario: AuthPayload,
  dados: { equipamentoId: string; descricaoProblema: string; titulo: string },
) {
  const equipamento = await prisma.equipamento.findUnique({
    where: { id: dados.equipamentoId },
    include: { tipoEquipamento: { select: { nome: true, permitePreventiva: true, permiteCorretiva: true } } },
  });
  if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
  const tipo = equipamento.tipoEquipamento;
  if (tipo && !tipo.permitePreventiva && !tipo.permiteCorretiva) {
    throw new AppError(`O tipo de item "${tipo.nome}" não permite manutenção.`, 422);
  }
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
      titulo: dados.titulo.trim(),
      descricaoProblema: dados.descricaoProblema,
    },
    include: includePadrao,
  });
}

// UC06/RF12/RF13 — aprovação pelo Administrador (RN03)
type TipoManutencaoItem = { permitePreventiva: boolean; permiteCorretiva: boolean };

// O vínculo da manutenção é com um item de contrato (serviço + escopo); o contrato vem dele. Regras: contrato
// vigente, escopo compatível com o que o tipo de item aceita e saldo disponível. O saldo só é consumido no
// orçamento (ou no custo final); a aprovação só recusa item já esgotado. A linha do item fica travada até o
// fim da transação. Enquanto aguarda orçamento, o Administrador pode trocar o item ou negar o chamado.
async function vincularItem(
  tx: Prisma.TransactionClient,
  contratoItemId: string,
  tipo: TipoManutencaoItem,
  manutencaoId: string,
  { valorNovo = 0, novaSelecao = true } = {},
) {
  await tx.$queryRaw`SELECT id FROM contrato_item WHERE id = ${contratoItemId} FOR UPDATE`;
  const item = await tx.contratoItem.findUnique({
    where: { id: contratoItemId },
    select: {
      id: true,
      contratoId: true,
      valor: true,
      contrato: { select: { status: true } },
      escopo: { select: { nome: true, cobrePreventiva: true, cobreCorretiva: true } },
    },
  });
  if (!item) throw new AppError('Item de contrato não encontrado.', 422);
  // Contrato vigente e escopo compatível valem na escolha do item; um orçamento posterior só confere o saldo
  if (novaSelecao && item.contrato.status === 'EXPIRADO') {
    throw new AppError('O contrato deste item está expirado.', 422);
  }
  const compativel =
    (tipo.permitePreventiva && item.escopo.cobrePreventiva) || (tipo.permiteCorretiva && item.escopo.cobreCorretiva);
  if (novaSelecao && !compativel) {
    throw new AppError(
      `O escopo "${item.escopo.nome}" não cobre o tipo de manutenção que este item aceita.`,
      422,
    );
  }
  const comprometido = (await comprometidoPorItem(tx, [item.id], manutencaoId)).get(item.id) ?? 0;
  const saldo = saldoDoItem(item.valor, comprometido);
  if (novaSelecao && saldo <= 0) throw new AppError('O item de contrato não tem saldo disponível.', 422);
  if (valorNovo > saldo) {
    throw new AppError(
      `O orçamento (${valorNovo.toFixed(2)}) excede o saldo disponível do item de contrato (${saldo.toFixed(2)}).`,
      422,
    );
  }
  return { contratoItemId: item.id, contratoId: item.contratoId };
}

export async function aprovar(usuario: AuthPayload, id: string, contratoItemId: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const vinculo = await vincularItem(tx, contratoItemId, manutencao.equipamento.tipoEquipamento, id);
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'AGUARDANDO_ORCAMENTO',
        decididoPorId: usuario.sub,
        ...vinculo,
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

// FA01 — negação com motivo. Também vale em AGUARDANDO_ORCAMENTO: o equipamento volta a ativo.
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  const aposAprovacao = manutencao.status === 'AGUARDANDO_ORCAMENTO';
  if (manutencao.status !== 'PENDENTE_APROVACAO' && !aposAprovacao) {
    throw new AppError('Somente solicitações pendentes ou aguardando orçamento podem ser negadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'NEGADA', motivoNegacao: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    if (aposAprovacao) {
      await tx.equipamento.update({
        where: { id: m.equipamentoId },
        data: { status: 'ATIVO' },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: m.equipamentoId,
          tipo: 'RETORNO_MANUTENCAO',
          descricao: `Manutenção negada após aprovação (aguardava orçamento). Motivo: ${motivo}`,
          unidadeDestinoId: m.unidadeId,
          usuarioId: usuario.sub,
        },
      });
    }
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

export async function trocarItem(usuario: AuthPayload, id: string, contratoItemId: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'AGUARDANDO_ORCAMENTO') {
    throw new AppError('O item de contrato só pode ser trocado enquanto a manutenção aguarda orçamento.', 422);
  }
  return prisma.$transaction(async (tx) => {
    const vinculo = await vincularItem(tx, contratoItemId, manutencao.equipamento.tipoEquipamento, id);
    const atualizada = await tx.manutencao.update({
      where: { id },
      data: vinculo,
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'TROCAR_ITEM_CONTRATO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { contratoItemId: manutencao.contratoItemId, contratoId: manutencao.contratoId },
        dadosDepois: { contratoItemId: vinculo.contratoItemId, contratoId: vinculo.contratoId },
      },
      tx,
    );
    return atualizada;
  });
}

// UC07/RF14 — registro do orçamento retornado pela terceirizada
export async function registrarOrcamento(
  usuario: AuthPayload,
  id: string,
  dados: { valor: number; descricao?: string },
) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'AGUARDANDO_ORCAMENTO') {
    throw new AppError('O orçamento só pode ser registrado quando a manutenção aguarda orçamento.', 422);
  }
  return prisma.$transaction(async (tx) => {
    // O item de contrato foi escolhido na aprovação; aqui só se confere o saldo. Manutenção antiga, sem item, não tem saldo a conferir
    const vinculo = manutencao.contratoItemId
      ? await vincularItem(tx, manutencao.contratoItemId, manutencao.equipamento.tipoEquipamento, id, {
          valorNovo: dados.valor,
          novaSelecao: false,
        })
      : {};
    const atualizada = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'ORCAMENTO_REGISTRADO',
        orcamentoValor: dados.valor,
        orcamentoDescricao: dados.descricao ?? null,
        ...vinculo,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REGISTRAR_ORCAMENTO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { status: 'ORCAMENTO_REGISTRADO', valor: dados.valor, perfil: usuario.perfil },
      },
      tx,
    );
    return atualizada;
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
    // RN07 — o Sistema abre automaticamente solicitação de substituição
    // em nome da unidade de origem do equipamento (o item já foi baixado acima).
    const solicitacaoAutomatica = await tx.solicitacao.create({
      data: {
        tipo: 'SUBSTITUICAO',
        status: 'PENDENTE_APROVACAO',
        unidadeOrigemId: m.unidadeId,
        equipamentoId: m.equipamentoId,
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
  // FA02 — o Administrador é notificado da solicitação automática
  const gestores = await prisma.usuario.findMany({
    where: { perfil: 'OPERADOR', ativo: true },
    select: { email: true },
  });
  for (const gestor of gestores) {
    await notificar(
      gestor.email,
      'Solicitação automática de substituição',
      `O equipamento ${resultado.equipamento.tombamento} foi baixado por impossibilidade de manutenção e uma solicitação de substituição foi aberta automaticamente para a unidade ${resultado.unidade.nome}.`,
    );
  }
  await notificar(
    resultado.unidade.emailBase,
    'Equipamento baixado',
    `O equipamento ${resultado.equipamento.tombamento} foi baixado por impossibilidade de manutenção. Uma solicitação de substituição foi aberta automaticamente.`,
  );
  return resultado;
}

// Terceirizada devolveu o equipamento — aguarda a confirmação dupla
export async function registrarRetorno(usuario: AuthPayload, id: string, custoFinal?: number) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'EM_EXECUCAO') {
    throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
  }
  if (manutencao.orcamentoValor === null) {
    throw new AppError('Não há orçamento aprovado para registrar o retorno.', 422);
  }
  const orcamento = Number(manutencao.orcamentoValor);
  // Zero não é custo real: o saldo do item cairia no COALESCE e devolveria o valor do orçamento.
  if (custoFinal !== undefined && custoFinal > orcamento) {
    throw new AppError('O custo final não pode ser maior que o orçamento aprovado.', 422);
  }
  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'AGUARDANDO_RETORNO',
        custoFinal: custoFinal ?? orcamento,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REGISTRAR_RETORNO_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { status: 'AGUARDANDO_RETORNO', perfil: usuario.perfil },
      },
      tx,
    );
    return atualizada;
  });
}

// UC09/RF18/RN11 — confirmação dupla: Unidade + Administrador
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
  if (usuario.perfil === 'OPERADOR') {
    dados.confirmadoGestor = true;
  } else if (usuario.perfil === 'UNIDADE') {
    if (manutencao.unidadeId !== usuario.unidadeId) {
      throw new AppError('Somente a unidade do equipamento pode confirmar o retorno.', 403);
    }
    dados.confirmadoUnidade = true;
  } else {
    throw new AppError('Somente a Unidade e o Administrador confirmam retorno.', 403);
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
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONFIRMAR_RETORNO_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { perfil: usuario.perfil },
      },
      tx,
    );
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
