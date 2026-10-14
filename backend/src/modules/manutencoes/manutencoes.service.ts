import { comprometidoPorItem, saldoDoItem } from '../contratos/saldo';
import {
  CategoriaProblemaCivil,
  EstadoConservacao,
  Prisma,
  StatusManutencao,
  TipoManutencao,
} from '@prisma/client';
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
    select: { id: true, valor: true, descontoPercentual: true, servico: { select: { nome: true } }, escopo: { select: { nome: true } } },
  },
  // Manutenção civil: serviços e materiais lançados pelo prestador
  linhasRelatorio: { orderBy: { criadoEm: 'asc' as const } },
} satisfies Prisma.ManutencaoInclude;

// Perfis que existiam antes da unificação em Administrador (ainda presentes em registros de auditoria antigos)
const PERFIS_UNIFICADOS = ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO'];

export async function listar(
  usuario: AuthPayload,
  filtros: { status?: StatusManutencao; busca?: string; tipo?: TipoManutencao },
) {
  if (usuario.perfil === 'TERCEIRIZADA' && !usuario.prestadorId) return [];
  const prestadorId = usuario.prestadorId;
  const where: Prisma.ManutencaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE' ? { unidadeId: usuario.unidadeId ?? '' } : {}),
    // Terceirizada: só as manutenções cobertas por contratos do seu prestador (o prestador vem do token)
    ...(usuario.perfil === 'TERCEIRIZADA' && prestadorId ? { contrato: { prestadorId } } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.busca
      ? {
          OR: [
            ...(numeroDaBusca(filtros.busca, 'MAN') !== null ? [{ numero: numeroDaBusca(filtros.busca, 'MAN') as number }] : []),
            { equipamento: { tombamento: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { equipamento: { descricao: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { unidade: { nome: { contains: filtros.busca, mode: 'insensitive' as const } } },
            { descricaoProblema: { contains: filtros.busca, mode: 'insensitive' as const } },
            { titulo: { contains: filtros.busca, mode: 'insensitive' as const } },
            { localAfetado: { contains: filtros.busca, mode: 'insensitive' as const } },
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
  // Abertura sintética (equipamento não grava auditoria na solicitação). No civil a auditoria
  // ABRIR_MANUTENCAO_CIVIL já existe — a sintética usa a mesma ação e o log duplicado é omitido.
  const acaoAbertura = manutencao.tipo === 'CIVIL' ? 'ABRIR_MANUTENCAO_CIVIL' : 'ABRIR_MANUTENCAO';
  return [
    {
      id: 'abertura',
      acao: acaoAbertura,
      criadoEm: manutencao.criadoEm,
      usuario: manutencao.solicitante?.nome ?? null,
    },
    ...logs
      .filter((log) => log.acao !== acaoAbertura)
      .map((log) => {
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
type TipoManutencaoItem = { permitePreventiva: boolean; permiteCorretiva: boolean; civil?: boolean };

type ManutencaoCarregada = Prisma.ManutencaoGetPayload<{ include: typeof includePadrao }>;

// O que o tipo de manutenção aceita: o tipo do item (equipamento) ou, no chamado civil, apenas escopo civil
function tipoParaContrato(m: ManutencaoCarregada): TipoManutencaoItem {
  if (m.tipo === 'CIVIL') return { permitePreventiva: false, permiteCorretiva: false, civil: true };
  return m.equipamento!.tipoEquipamento;
}

function exigirCivil(m: { tipo: TipoManutencao }, acao: string) {
  if (m.tipo !== 'CIVIL') throw new AppError(`${acao} só vale para manutenção civil.`, 422);
}

function exigirEquipamento(m: ManutencaoCarregada) {
  if (!m.equipamento || !m.equipamentoId) throw new AppError('Esta manutenção civil não tem equipamento.', 422);
  return { equipamento: m.equipamento, equipamentoId: m.equipamentoId };
}

// O vínculo da manutenção é com um item de contrato (serviço + escopo); o contrato vem dele. Regras: contrato
// vigente, escopo compatível com o que o tipo de item aceita e saldo disponível. O saldo só é consumido no
// orçamento (ou no custo final); a aprovação só recusa item já esgotado. A linha do item fica travada até o
// fim da transação. Enquanto aguarda orçamento, o Administrador pode trocar o item ou negar o chamado.
async function vincularItem(
  tx: Prisma.TransactionClient,
  contratoItemId: string,
  tipo: TipoManutencaoItem,
  manutencaoId: string,
  { valorNovo = 0, novaSelecao = true, rotulo = 'orçamento' } = {},
) {
  await tx.$queryRaw`SELECT id FROM contrato_item WHERE id = ${contratoItemId} FOR UPDATE`;
  const item = await tx.contratoItem.findUnique({
    where: { id: contratoItemId },
    select: {
      id: true,
      contratoId: true,
      valor: true,
      contrato: { select: { status: true } },
      escopo: { select: { nome: true, cobrePreventiva: true, cobreCorretiva: true, cobreCivil: true } },
    },
  });
  if (!item) throw new AppError('Item de contrato não encontrado.', 422);
  // Vigência na escolha do item e sempre que o saldo for consumido (orçamento ou custo final civil)
  if ((novaSelecao || valorNovo > 0) && item.contrato.status === 'EXPIRADO') {
    throw new AppError('O contrato deste item está expirado.', 422);
  }
  const compativel = tipo.civil
    ? item.escopo.cobreCivil
    : (tipo.permitePreventiva && item.escopo.cobrePreventiva) || (tipo.permiteCorretiva && item.escopo.cobreCorretiva);
  if (novaSelecao && !compativel) {
    throw new AppError(
      tipo.civil
        ? `O escopo "${item.escopo.nome}" não cobre manutenção civil.`
        : `O escopo "${item.escopo.nome}" não cobre o tipo de manutenção que este item aceita.`,
      422,
    );
  }
  const comprometido = (await comprometidoPorItem(tx, [item.id], manutencaoId)).get(item.id) ?? 0;
  const saldo = saldoDoItem(item.valor, comprometido);
  if (novaSelecao && saldo <= 0) throw new AppError('O item de contrato não tem saldo disponível.', 422);
  if (valorNovo > saldo) {
    throw new AppError(
      `O ${rotulo} (${valorNovo.toFixed(2)}) excede o saldo disponível do item de contrato (${saldo.toFixed(2)}).`,
      422,
    );
  }
  return { contratoItemId: item.id, contratoId: item.contratoId };
}

export async function aprovar(usuario: AuthPayload, id: string, contratoItemId: string) {
  const manutencao = await buscarPorId(usuario, id);
  const civil = manutencao.tipo === 'CIVIL';
  // Civil: o chamado que aguardava providências (sem contrato/saldo) volta à triagem quando houver cobertura
  const podeAprovar = manutencao.status === 'PENDENTE_APROVACAO' || (civil && manutencao.status === 'AGUARDANDO_PROVIDENCIAS');
  if (!podeAprovar) {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const vinculo = await vincularItem(tx, contratoItemId, tipoParaContrato(manutencao), id);
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        // Civil não tem orçamento: o prestador recebe o chamado para executar
        status: civil ? 'AGUARDANDO_EXECUCAO' : 'AGUARDANDO_ORCAMENTO',
        decididoPorId: usuario.sub,
        motivoPendencia: null,
        ...vinculo,
        dataEnvio: new Date(),
      },
      include: includePadrao,
    });
    if (!civil) {
      const { equipamentoId } = exigirEquipamento(m);
      // RF13 — equipamento passa a "em manutenção"
      await tx.equipamento.update({
        where: { id: equipamentoId },
        data: { status: 'EM_MANUTENCAO' },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId,
          tipo: 'ENVIO_MANUTENCAO',
          descricao: `Manutenção aprovada — equipamento encaminhado para a terceirizada`,
          unidadeOrigemId: m.unidadeId,
          usuarioId: usuario.sub,
        },
      });
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'APROVAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: m.status, ...(civil ? { contratoId: vinculo.contratoId } : {}) },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    civil ? 'Chamado de manutenção civil encaminhado' : 'Manutenção aprovada',
    civil
      ? `O chamado ${atualizada.titulo ?? ''} foi encaminhado ao prestador ${atualizada.contrato?.prestador.nome ?? ''} (contrato ${atualizada.contrato?.numero ?? ''}), responsável pelo atendimento.`
      : `A solicitação de manutenção do equipamento ${atualizada.equipamento?.tombamento ?? ''} foi aprovada e o equipamento será encaminhado para a terceirizada.`,
  );
  return atualizada;
}

// Civil — sem contrato ou saldo para encaminhar: o chamado fica aguardando providências e não vai à empresa
export async function aguardarProvidencias(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'Aguardar providências');
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente chamados em triagem podem aguardar providências.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'AGUARDANDO_PROVIDENCIAS', motivoPendencia: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'AGUARDAR_PROVIDENCIAS',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'AGUARDANDO_PROVIDENCIAS', motivo },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    'Chamado de manutenção civil aguardando providências',
    `O chamado ${atualizada.titulo ?? ''} está aguardando providências e ainda não foi encaminhado a um prestador. Motivo: ${motivo}`,
  );
  return atualizada;
}

// Civil — triagem: outros chamados abertos da mesma unidade e do mesmo tipo de problema (evita atendimento duplicado)
export async function similares(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'A busca por chamados parecidos');
  return prisma.manutencao.findMany({
    where: {
      id: { not: id },
      tipo: 'CIVIL',
      unidadeId: manutencao.unidadeId,
      ...(manutencao.categoriaCivil ? { categoriaCivil: manutencao.categoriaCivil } : {}),
      status: { notIn: ['NEGADA', 'CONCLUIDA', 'BAIXADO'] },
    },
    select: { id: true, numero: true, titulo: true, status: true, localAfetado: true, criadoEm: true },
    orderBy: { criadoEm: 'desc' },
    take: 10,
  });
}

// FA01 — negação com motivo. Também vale em AGUARDANDO_ORCAMENTO: o equipamento volta a ativo.
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  // Civil: com o chamado nas mãos do prestador o Administrador não o nega
  if (manutencao.tipo === 'CIVIL' && manutencao.status === 'AGUARDANDO_EXECUCAO') {
    throw new AppError('O chamado está com o prestador, aguardando execução. Só é possível negar na triagem.', 422);
  }
  const aposAprovacao = manutencao.status === 'AGUARDANDO_ORCAMENTO';
  const aguardandoProvidencias = manutencao.tipo === 'CIVIL' && manutencao.status === 'AGUARDANDO_PROVIDENCIAS';
  if (manutencao.status !== 'PENDENTE_APROVACAO' && !aposAprovacao && !aguardandoProvidencias) {
    throw new AppError('Somente solicitações pendentes ou aguardando orçamento podem ser negadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'NEGADA', motivoNegacao: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    if (aposAprovacao && m.equipamentoId) {
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
    atualizada.equipamento
      ? `A solicitação de manutenção do equipamento ${atualizada.equipamento.tombamento} foi negada. Motivo: ${motivo}`
      : `O chamado de manutenção civil ${atualizada.titulo ?? ''} foi negado. Motivo: ${motivo}`,
  );
  return atualizada;
}

export async function trocarItem(usuario: AuthPayload, id: string, contratoItemId: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.tipo === 'CIVIL') {
    throw new AppError('No chamado civil o item de contrato é definido na triagem e não muda depois do encaminhamento.', 422);
  }
  if (manutencao.status !== 'AGUARDANDO_ORCAMENTO') {
    throw new AppError('O item de contrato só pode ser trocado enquanto a manutenção aguarda orçamento.', 422);
  }
  return prisma.$transaction(async (tx) => {
    const vinculo = await vincularItem(tx, contratoItemId, tipoParaContrato(manutencao), id);
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
  dados: { valor?: number; descricao?: string },
) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'AGUARDANDO_ORCAMENTO') {
    throw new AppError('O orçamento só pode ser registrado quando a manutenção aguarda orçamento.', 422);
  }
  if (manutencao.tipo === 'CIVIL') {
    throw new AppError('A manutenção civil não tem orçamento: os serviços executados são informados ao finalizar.', 422);
  }
  if (dados.valor === undefined) throw new AppError('Informe o valor do orçamento.', 422);
  const valorFinal = dados.valor;
  return prisma.$transaction(async (tx) => {
    // O item de contrato foi escolhido na aprovação; aqui só se confere o saldo. Manutenção antiga, sem item, não tem saldo a conferir
    const vinculo = manutencao.contratoItemId
      ? await vincularItem(tx, manutencao.contratoItemId, tipoParaContrato(manutencao), id, {
          valorNovo: valorFinal,
          novaSelecao: false,
        })
      : {};
    const atualizada = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'ORCAMENTO_REGISTRADO',
        orcamentoValor: valorFinal,
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
        dadosDepois: { status: 'ORCAMENTO_REGISTRADO', valor: valorFinal, perfil: usuario.perfil },
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
  dados: { aprovado: boolean; laudoBaixa?: string; motivo?: string },
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
  const { equipamento, equipamentoId } = exigirEquipamento(manutencao);
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
      where: { id: equipamentoId },
      data: { status: 'BAIXADO' },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId,
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
        equipamentoId,
        tipoEquipamentoId: equipamento.tipoEquipamentoId,
        quantidade: 1,
        justificativa: `Substituição de equipamento baixado por impossibilidade de manutenção (tombamento ${equipamento.tombamento}). Solicitação gerada automaticamente pelo sistema.`,
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
      `O equipamento ${equipamento.tombamento} foi baixado por impossibilidade de manutenção e uma solicitação de substituição foi aberta automaticamente para a unidade ${resultado.unidade.nome}.`,
    );
  }
  await notificar(
    resultado.unidade.emailBase,
    'Equipamento baixado',
    `O equipamento ${equipamento.tombamento} foi baixado por impossibilidade de manutenção. Uma solicitação de substituição foi aberta automaticamente.`,
  );
  return resultado;
}

// Terceirizada devolveu o equipamento — aguarda a confirmação dupla
export async function registrarRetorno(usuario: AuthPayload, id: string, custoFinal?: number) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'EM_EXECUCAO') {
    throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
  }
  if (manutencao.tipo === 'CIVIL') return finalizarCivil(usuario, manutencao);
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
  if (manutencao.tipo === 'CIVIL') return confirmarResolucaoCivil(usuario, manutencao);
  const { equipamentoId } = exigirEquipamento(manutencao);
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
        where: { id: equipamentoId },
        data: {
          status: 'ATIVO',
          ...(m.estadoPosManutencao ? { estadoConservacao: m.estadoPosManutencao } : {}),
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId,
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

// ---------------------------------------------------------------------------------------------------------------
// Manutenção civil: abertura, relatório do prestador, contestação e conferência para medição
// ---------------------------------------------------------------------------------------------------------------

export async function solicitarCivil(
  usuario: AuthPayload,
  dados: {
    titulo: string;
    descricaoProblema: string;
    localAfetado: string;
    categoriaCivil: CategoriaProblemaCivil;
    unidadeId?: string;
    fotos: string[];
  },
) {
  // A Unidade abre sempre para a própria unidade (vem do token); só o Administrador escolhe outra
  const unidadeId = usuario.perfil === 'UNIDADE' ? usuario.unidadeId : (dados.unidadeId ?? null);
  if (!unidadeId) throw new AppError('Informe a unidade do chamado.', 422);
  const unidade = await prisma.unidade.findUnique({ where: { id: unidadeId }, select: { id: true } });
  if (!unidade) throw new AppError('Unidade não encontrada.', 404);
  const manutencao = await prisma.$transaction(async (tx) => {
    const criada = await tx.manutencao.create({
      data: {
        tipo: 'CIVIL',
        unidadeId,
        solicitanteId: usuario.sub,
        titulo: dados.titulo.trim(),
        descricaoProblema: dados.descricaoProblema,
        localAfetado: dados.localAfetado.trim(),
        categoriaCivil: dados.categoriaCivil,
        fotos: dados.fotos,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ABRIR_MANUTENCAO_CIVIL',
        entidade: 'manutencao',
        entidadeId: criada.id,
        dadosDepois: { unidadeId, categoriaCivil: dados.categoriaCivil, fotos: dados.fotos.length },
      },
      tx,
    );
    return criada;
  });
  return manutencao;
}

const MAX_LINHAS_RELATORIO = 200;
const arredondar = (n: number) => Math.round(n * 100) / 100;

type Linha = { quantidade: Prisma.Decimal | number | string; valorUnitario: Prisma.Decimal | number | string };
const valorDaLinha = (l: Linha) => arredondar(Number(l.quantidade) * Number(l.valorUnitario));
const totalRelatorio = (linhas: Linha[]) => arredondar(linhas.reduce((t, l) => t + valorDaLinha(l), 0));

// Os serviços e materiais executados são informados pelo prestador enquanto o chamado está em execução
// (inclusive depois de um ajuste pedido pelo Administrador ou de uma contestação da Unidade).
function exigirExecucaoAberta(m: ManutencaoCarregada) {
  exigirCivil(m, 'O registro de serviços e materiais');
  if (m.status !== 'EM_EXECUCAO') {
    throw new AppError('Os serviços e materiais só podem ser alterados com o serviço em execução.', 422);
  }
}

export async function adicionarLinhaRelatorio(
  usuario: AuthPayload,
  id: string,
  dados: { itemSinapiId: string; quantidade: number },
) {
  const manutencao = await buscarPorId(usuario, id);
  exigirExecucaoAberta(manutencao);
  if (!manutencao.contratoItem) {
    throw new AppError('O chamado ainda não tem item de contrato; não há desconto a aplicar.', 422);
  }
  const itemSinapi = await prisma.itemSinapi.findUnique({ where: { id: dados.itemSinapiId } });
  if (!itemSinapi || !itemSinapi.ativo) throw new AppError('Item da tabela SINAPI não encontrado.', 404);
  // O prestador não informa preço: vale o da tabela com o desconto do item de contrato, congelado na linha
  const desconto = Number(manutencao.contratoItem.descontoPercentual);
  const precoSinapi = Number(itemSinapi.preco);
  const valorUnitario = arredondar(precoSinapi * (1 - desconto / 100));
  return prisma.$transaction(async (tx) => {
    // Trava o chamado: finalização concorrente não pode deixar linha entrar depois do custoFinal
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { linhasRelatorio: true } } },
    });
    if (atual.status !== 'EM_EXECUCAO') {
      throw new AppError('Os serviços e materiais só podem ser alterados com o serviço em execução.', 422);
    }
    if (atual._count.linhasRelatorio >= MAX_LINHAS_RELATORIO) {
      throw new AppError(`O registro aceita no máximo ${MAX_LINHAS_RELATORIO} lançamentos.`, 422);
    }
    await tx.linhaRelatorioManutencao.create({
      data: {
        manutencaoId: id,
        tipo: itemSinapi.tipo,
        descricao: itemSinapi.descricao,
        unidadeMedida: itemSinapi.unidade,
        quantidade: dados.quantidade,
        valorUnitario,
        itemSinapiId: itemSinapi.id,
        codigoSinapi: itemSinapi.codigo,
        precoSinapi,
        descontoPercentual: desconto,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'INCLUIR_LINHA_RELATORIO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: {
          codigoSinapi: itemSinapi.codigo,
          descricao: itemSinapi.descricao,
          precoSinapi,
          descontoPercentual: desconto,
          valor: valorDaLinha({ quantidade: dados.quantidade, valorUnitario }),
          perfil: usuario.perfil,
        },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

export async function removerLinhaRelatorio(usuario: AuthPayload, id: string, linhaId: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirExecucaoAberta(manutencao);
  const linha = manutencao.linhasRelatorio.find((l) => l.id === linhaId);
  if (!linha) throw new AppError('Lançamento não encontrado.', 404);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (atual.status !== 'EM_EXECUCAO') {
      throw new AppError('Os serviços e materiais só podem ser alterados com o serviço em execução.', 422);
    }
    const apagada = await tx.linhaRelatorioManutencao.deleteMany({ where: { id: linhaId, manutencaoId: id } });
    if (apagada.count === 0) throw new AppError('Lançamento não encontrado.', 404);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REMOVER_LINHA_RELATORIO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { descricao: linha.descricao, valor: valorDaLinha(linha) },
        dadosDepois: { perfil: usuario.perfil },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

// O prestador inicia o serviço do chamado que lhe foi encaminhado
export async function iniciarExecucao(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'Iniciar a execução');
  if (manutencao.status !== 'AGUARDANDO_EXECUCAO') {
    throw new AppError('Só é possível iniciar a execução de um chamado aguardando execução.', 422);
  }
  return prisma.$transaction(async (tx) => {
    const atualizada = await tx.manutencao.update({
      where: { id },
      data: { status: 'EM_EXECUCAO' },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'INICIAR_EXECUCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'EM_EXECUCAO', perfil: usuario.perfil },
      },
      tx,
    );
    return atualizada;
  });
}

// O prestador confirma a finalização informando os serviços e materiais executados. O total vira o custo do
// chamado e é conferido contra o saldo do item de contrato. Na primeira finalização (ou após contestação da
// Unidade) o chamado aguarda a Unidade; se o Administrador tinha pedido ajustes, volta direto à aprovação final.
async function finalizarCivil(usuario: AuthPayload, manutencao: ManutencaoCarregada) {
  const id = manutencao.id;
  const atualizada = await prisma.$transaction(async (tx) => {
    // Trava e relê: o total precisa bater com as linhas no momento da finalização
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({
      where: { id },
      include: { linhasRelatorio: true, equipamento: { include: { tipoEquipamento: true } } },
    });
    if (atual.status !== 'EM_EXECUCAO') {
      throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
    }
    if (atual.linhasRelatorio.length === 0) {
      throw new AppError('Informe ao menos um serviço ou material executado antes de confirmar a finalização.', 422);
    }
    const total = totalRelatorio(atual.linhasRelatorio);
    // Pedido de ajustes do Administrador: a Unidade já tinha confirmado a resolução; não passa por ela de novo.
    const aposAjustesAdmin = Boolean(atual.motivoAjuste);
    const statusDestino = aposAjustesAdmin ? 'AGUARDANDO_MEDICAO' : 'AGUARDANDO_RETORNO';
    // Chamado antigo, sem item de contrato, não tem saldo a conferir
    const vinculo = atual.contratoItemId
      ? await vincularItem(tx, atual.contratoItemId, tipoParaContrato(atual as ManutencaoCarregada), id, {
          valorNovo: total,
          novaSelecao: false,
          rotulo: 'valor dos serviços executados',
        })
      : {};
    const mudou = await tx.manutencao.updateMany({
      where: { id, status: 'EM_EXECUCAO' },
      data: {
        status: statusDestino,
        custoFinal: total,
        confirmadoUnidade: aposAjustesAdmin,
        contestacaoUnidade: null,
        motivoAjuste: null,
        ...vinculo,
      },
    });
    if (mudou.count === 0) {
      throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REGISTRAR_RETORNO_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: {
          status: statusDestino,
          total,
          linhas: atual.linhasRelatorio.length,
          perfil: usuario.perfil,
          aposAjustesAdmin,
        },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  // Só avisa o Administrador quando a finalização pulou a Unidade (retorno após ajustes)
  if (atualizada.status === 'AGUARDANDO_MEDICAO' && atualizada.confirmadoUnidade) {
    const admins = await prisma.usuario.findMany({ where: { perfil: 'OPERADOR', ativo: true }, select: { email: true } });
    for (const admin of admins) {
      await notificar(
        admin.email,
        'Chamado civil aguardando autorização de medição',
        `O prestador reenviou os serviços do chamado ${atualizada.titulo ?? ''} após os ajustes. Falta autorizar a medição.`,
      );
    }
  }
  return atualizada;
}

// O Administrador não concorda com os serviços informados: o chamado volta à execução e o valor deixa de ocupar o saldo
export async function solicitarAjustes(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'A solicitação de ajustes');
  if (manutencao.status !== 'AGUARDANDO_MEDICAO') {
    throw new AppError('Só é possível solicitar ajustes depois que a unidade confirmar a resolução.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const mudou = await tx.manutencao.updateMany({
      where: { id, status: 'AGUARDANDO_MEDICAO' },
      data: { status: 'EM_EXECUCAO', custoFinal: null, confirmadoUnidade: false, motivoAjuste: motivo },
    });
    if (mudou.count === 0) {
      throw new AppError('Só é possível solicitar ajustes depois que a unidade confirmar a resolução.', 422);
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'SOLICITAR_AJUSTES',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status, custoFinal: manutencao.custoFinal },
        dadosDepois: { status: 'EM_EXECUCAO', motivo },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  const prestador = atualizada.contrato
    ? await prisma.prestadorServico.findUnique({ where: { id: atualizada.contrato.prestadorId }, select: { email: true } })
    : null;
  await notificar(
    prestador?.email,
    'Ajustes solicitados no chamado',
    `O Administrador pediu ajustes nos serviços informados do chamado ${atualizada.titulo ?? ''}. Motivo: ${motivo}`,
  );
  return atualizada;
}

// "Problema resolvido": só a Unidade confirma. O chamado fica aguardando o Administrador autorizar a medição.
async function confirmarResolucaoCivil(usuario: AuthPayload, manutencao: ManutencaoCarregada) {
  if (usuario.perfil !== 'UNIDADE') {
    throw new AppError('No chamado civil a Unidade confirma a resolução; o Administrador autoriza a medição depois.', 403);
  }
  if (manutencao.unidadeId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade do chamado pode confirmar a resolução.', 403);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id: manutencao.id },
      data: { status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONFIRMAR_RETORNO_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: manutencao.id,
        dadosDepois: { status: 'AGUARDANDO_MEDICAO', perfil: usuario.perfil },
      },
      tx,
    );
    return m;
  });
  const admins = await prisma.usuario.findMany({ where: { perfil: 'OPERADOR', ativo: true }, select: { email: true } });
  for (const admin of admins) {
    await notificar(
      admin.email,
      'Chamado civil aguardando autorização de medição',
      `A unidade ${atualizada.unidade.nome} confirmou a resolução do chamado ${atualizada.titulo ?? ''}. Falta autorizar a medição.`,
    );
  }
  return atualizada;
}

// A Unidade diz que o problema persiste: o chamado volta à execução com o motivo registrado
export async function contestar(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'A contestação');
  if (manutencao.status !== 'AGUARDANDO_RETORNO') {
    throw new AppError('Só é possível contestar um serviço que aguarda a confirmação da unidade.', 422);
  }
  if (manutencao.unidadeId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade do chamado pode contestar.', 403);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'EM_EXECUCAO', confirmadoUnidade: false, contestacaoUnidade: motivo, custoFinal: null },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONTESTAR_EXECUCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { status: 'EM_EXECUCAO', motivo },
      },
      tx,
    );
    return m;
  });
  const admins = await prisma.usuario.findMany({ where: { perfil: 'OPERADOR', ativo: true }, select: { email: true } });
  for (const admin of admins) {
    await notificar(
      admin.email,
      'Execução contestada pela unidade',
      `A unidade ${atualizada.unidade.nome} contestou a execução do chamado ${atualizada.titulo ?? ''}; ele voltou ao prestador.`,
    );
  }
  return atualizada;
}

// O Administrador autoriza a medição depois da confirmação da Unidade: conclui o chamado e fixa o
// consumo do saldo do item de contrato no valor dos serviços executados (custoFinal).
export async function autorizarMedicao(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirCivil(manutencao, 'A autorização de medição');
  if (manutencao.status !== 'AGUARDANDO_MEDICAO') {
    throw new AppError('Só é possível autorizar a medição depois que a unidade confirmar a resolução.', 422);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true, custoFinal: true } });
    if (atual.status !== 'AGUARDANDO_MEDICAO') {
      throw new AppError('Só é possível autorizar a medição depois que a unidade confirmar a resolução.', 422);
    }
    const total = atual.custoFinal === null ? null : Number(atual.custoFinal);
    const mudou = await tx.manutencao.updateMany({
      where: { id, status: 'AGUARDANDO_MEDICAO' },
      data: {
        status: 'CONCLUIDA',
        confirmadoGestor: true,
        dataConclusao: new Date(),
        conferidoMedicaoEm: new Date(),
        conferidoMedicaoPorId: usuario.sub,
      },
    });
    if (mudou.count === 0) {
      throw new AppError('Só é possível autorizar a medição depois que a unidade confirmar a resolução.', 422);
    }
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'AUTORIZAR_MEDICAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { status: 'CONCLUIDA', total },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}
