import { EstadoConservacao, OrigemRecurso, Prisma, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import { AuthPayload } from '../../middlewares/auth';

const includePadrao = {
  unidadeOrigem: { select: { id: true, nome: true, emailBase: true } },
  unidadeDestino: { select: { id: true, nome: true, emailBase: true, tipo: true } },
  equipamento: {
    select: { id: true, tombamento: true, descricao: true, status: true, emendaParlamentar: true, tipoEquipamentoId: true },
  },
  tipoEquipamento: { select: { id: true, nome: true, codigo: true } },
  ata: { select: { id: true, numero: true, saldo: true, vencimento: true } },
  criadoPor: { select: { nome: true } },
  decididoPor: { select: { nome: true } },
  // Itens (Equipamento) criados por esta solicitação ao marcar "lançado no
  // Branet" — usados na confirmação de recebimento (comparar tombamento) e
  // no eventual ajuste antes de concluir (feedback do cliente 17/08).
  itensGerados: { select: { id: true, tombamento: true, descricao: true } },
} satisfies Prisma.SolicitacaoInclude;

// Tipos que seguem o fluxo de aquisição via ata (RF29): pedem um item novo
// ao galpão, com ou sem baixa associada de um equipamento existente.
const TIPOS_COM_ATA: TipoSolicitacao[] = ['AMPLIACAO', 'SUBSTITUICAO'];

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
  // Solicitações aguardando estoque: prioridade (1 = mais urgente, definida
  // pelo Gestor na aprovação) + antiguidade juntas, conforme feedback do
  // cliente 17/08 — nos demais filtros mantém mais recente primeiro.
  const orderBy: Prisma.SolicitacaoOrderByWithRelationInput[] =
    filtros.status === 'AGUARDANDO_DISPONIBILIDADE'
      ? [{ prioridade: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'asc' }]
      : [{ criadoEm: 'desc' }];
  const solicitacoes = await prisma.solicitacao.findMany({
    where,
    include: includePadrao,
    orderBy,
  });
  return anotarDisponibilidade(solicitacoes);
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
  const [anotada] = await anotarDisponibilidade([solicitacao]);
  return anotada;
}

export interface DadosCriacao {
  tipo: TipoSolicitacao;
  justificativa: string;
  equipamentoId?: string;
  unidadeDestinoId?: string;
  tipoEquipamentoId?: string;
  quantidade?: number;
  // Ampliação: seleção de múltiplos itens numa única tela — vira uma
  // Solicitacao por item internamente (feedback do cliente 17/08)
  itens?: Array<{ tipoEquipamentoId: string; quantidade: number }>;
  origemRecurso?: OrigemRecurso;
  entidadeExternaNome?: string;
  dataRetornoPrevista?: Date;
}

async function buscarEquipamentoDaUnidade(equipamentoId: string, unidadeOrigemId: string) {
  const equipamento = await prisma.equipamento.findUnique({ where: { id: equipamentoId } });
  if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
  if (equipamento.unidadeId !== unidadeOrigemId) {
    throw new AppError('Só é possível abrir solicitações para equipamentos do inventário da sua unidade.', 403);
  }
  return equipamento;
}

// Tenta reservar do estoque de galpão já existente (mesma tabela por trás da
// tela de Estoque) — pega o galpão com mais quantidade que sozinho atenda a
// solicitação e decrementa. Não faz reserva parcial entre galpões.
async function tentarReservarDoEstoque(
  tx: Prisma.TransactionClient,
  tipoEquipamentoId: string,
  quantidade: number,
) {
  const pools = await tx.estoqueGalpao.findMany({
    where: { tipoEquipamentoId },
    orderBy: { quantidade: 'desc' },
  });
  const pool = pools.find((p) => p.quantidade >= quantidade);
  if (!pool) return null;
  await tx.estoqueGalpao.update({
    where: { id: pool.id },
    data: { quantidade: { decrement: quantidade } },
  });
  return pool;
}

// Indica no card se já há estoque suficiente pra reservar uma solicitação em
// AGUARDANDO_DISPONIBILIDADE, sem reservar de fato — só pra sinalizar pro
// Gestor de Patrimônio que vale clicar em "Tentar Reservar do Estoque".
async function anotarDisponibilidade<
  T extends { status: string; tipoEquipamentoId: string | null; quantidade: number | null },
>(solicitacoes: T[]): Promise<(T & { disponivelParaReserva: boolean })[]> {
  const pendentes = solicitacoes.filter(
    (s) => s.status === 'AGUARDANDO_DISPONIBILIDADE' && s.tipoEquipamentoId,
  );
  const maiorPorTipo = new Map<string, number>();
  if (pendentes.length > 0) {
    const pools = await prisma.estoqueGalpao.findMany({
      where: { tipoEquipamentoId: { in: [...new Set(pendentes.map((s) => s.tipoEquipamentoId!))] } },
    });
    for (const pool of pools) {
      maiorPorTipo.set(
        pool.tipoEquipamentoId,
        Math.max(maiorPorTipo.get(pool.tipoEquipamentoId) ?? 0, pool.quantidade),
      );
    }
  }
  return solicitacoes.map((s) => ({
    ...s,
    disponivelParaReserva:
      s.status === 'AGUARDANDO_DISPONIBILIDADE' &&
      !!s.tipoEquipamentoId &&
      (maiorPorTipo.get(s.tipoEquipamentoId) ?? 0) >= (s.quantidade ?? 0),
  }));
}

// UC10/UC13/UC16 + recolha — 5 tipos: Substituição, Ampliação, Cessão de
// Uso (externa), Empréstimo (interno, com ou sem retorno) e Recolha.
// Retorna sempre os ids das Solicitacao criadas (array) — Ampliação pode
// gerar mais de uma (feedback do cliente 17/08: seleção de múltiplos itens
// numa única tela, uma Solicitacao por tipo de equipamento internamente).
export async function criar(usuario: AuthPayload, dados: DadosCriacao): Promise<string[]> {
  if (!usuario.unidadeId) {
    throw new AppError('Usuário não está vinculado a uma unidade.', 403);
  }
  const unidadeOrigemId = usuario.unidadeId;

  if (dados.tipo === 'AMPLIACAO') {
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um item para a ampliação.', 422);
    }
    const criadas = await prisma.$transaction(
      dados.itens.map((item) =>
        prisma.solicitacao.create({
          data: {
            tipo: 'AMPLIACAO',
            unidadeOrigemId,
            tipoEquipamentoId: item.tipoEquipamentoId,
            quantidade: item.quantidade,
            justificativa: dados.justificativa,
            origemRecurso: dados.origemRecurso ?? 'REGULAR',
            criadoPorId: usuario.sub,
          },
        }),
      ),
    );
    return criadas.map((s) => s.id);
  }

  if (dados.tipo === 'SUBSTITUICAO') {
    if (!dados.equipamentoId) throw new AppError('Informe o equipamento a ser substituído.', 422);
    if (!dados.tipoEquipamentoId || !dados.quantidade) {
      throw new AppError('Substituição exige tipo de equipamento e quantidade do item de reposição.', 422);
    }
    // Aceita equipamento ATIVO (pedido manual) ou já BAIXADO (RN07 — automático)
    const equipamento = await buscarEquipamentoDaUnidade(dados.equipamentoId, unidadeOrigemId);
    if (!['ATIVO', 'BAIXADO'].includes(equipamento.status)) {
      throw new AppError(
        `O equipamento está com status ${equipamento.status} e não pode ser substituído até o encerramento do ciclo atual.`,
        422,
      );
    }
    const criada = await prisma.solicitacao.create({
      data: {
        tipo: 'SUBSTITUICAO',
        unidadeOrigemId,
        equipamentoId: equipamento.id,
        tipoEquipamentoId: dados.tipoEquipamentoId,
        quantidade: dados.quantidade,
        justificativa: dados.justificativa,
        origemRecurso: dados.origemRecurso ?? 'REGULAR',
        criadoPorId: usuario.sub,
      },
    });
    return [criada.id];
  }

  // Demais tipos exigem um equipamento ATIVO do inventário da própria unidade
  if (!dados.equipamentoId) {
    throw new AppError('Informe o equipamento da solicitação.', 422);
  }
  const equipamento = await buscarEquipamentoDaUnidade(dados.equipamentoId, unidadeOrigemId);
  // RN02/FA07 — equipamento em manutenção não pode ser cedido/emprestado/baixado
  if (equipamento.status !== 'ATIVO') {
    throw new AppError(
      `O equipamento está com status ${equipamento.status} e não pode ser movimentado até o encerramento do ciclo atual.`,
      422,
    );
  }

  if (dados.tipo === 'CESSAO_USO') {
    // Cessão de Uso é exclusiva para entidades externas ao município
    if (!dados.entidadeExternaNome?.trim()) {
      throw new AppError('Informe o nome da entidade externa que receberá o equipamento.', 422);
    }
    const criada = await prisma.solicitacao.create({
      data: {
        tipo: 'CESSAO_USO',
        unidadeOrigemId,
        entidadeExternaNome: dados.entidadeExternaNome.trim(),
        equipamentoId: equipamento.id,
        justificativa: dados.justificativa,
        criadoPorId: usuario.sub,
      },
    });
    return [criada.id];
  }

  if (dados.tipo === 'EMPRESTIMO') {
    if (!dados.unidadeDestinoId) throw new AppError('Informe a unidade de destino do empréstimo.', 422);
    if (dados.unidadeDestinoId === unidadeOrigemId) {
      throw new AppError('A unidade de destino deve ser diferente da unidade de origem.', 422);
    }
    // RN05 — empréstimo não requer aprovação do Gestor de Patrimônio, com ou
    // sem data de retorno (ausência de data = transferência permanente).
    // RF25/RN06 — tombamento permanece na origem; destino é detentor temporário
    // até a confirmação de recebimento.
    const solicitacao = await prisma.$transaction(async (tx) => {
      const criada = await tx.solicitacao.create({
        data: {
          tipo: 'EMPRESTIMO',
          status: 'AGUARDANDO_RECEBIMENTO',
          unidadeOrigemId,
          unidadeDestinoId: dados.unidadeDestinoId,
          equipamentoId: equipamento.id,
          justificativa: dados.justificativa,
          dataRetornoPrevista: dados.dataRetornoPrevista ?? null,
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
          descricao: dados.dataRetornoPrevista
            ? `Empréstimo registrado com retorno previsto para ${dados.dataRetornoPrevista.toLocaleDateString('pt-BR')}`
            : 'Transferência registrada sem data de retorno (permanente)',
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
    return [solicitacao.id];
  }

  // RECOLHA — a unidade escolhe o galpão que deve recolher o equipamento
  if (!dados.unidadeDestinoId) throw new AppError('Informe o galpão de destino da recolha.', 422);
  const galpao = await prisma.unidade.findUnique({ where: { id: dados.unidadeDestinoId } });
  if (!galpao || galpao.tipo !== 'GALPAO') {
    throw new AppError('O destino da recolha deve ser uma unidade do tipo galpão.', 422);
  }
  const criada = await prisma.solicitacao.create({
    data: {
      tipo: 'RECOLHA',
      unidadeOrigemId,
      unidadeDestinoId: galpao.id,
      equipamentoId: equipamento.id,
      justificativa: dados.justificativa,
      criadoPorId: usuario.sub,
    },
  });
  return [criada.id];
}

// UC11/UC17/RN04 — aprovação pelo Gestor de Patrimônio. Para Ampliação e
// Substituição, o sistema decide sozinho se reserva do estoque de galpão ou
// se fica aguardando disponibilidade — o solicitante nunca vê ata/saldo
// (feedback do Gestor de Patrimônio: gestão de ata é assunto interno).
// `prioridade` (1–3, opcional) é definida pelo Gestor, não pelo solicitante,
// e usada depois pra ordenar quem atender primeiro quando chega estoque novo.
export async function aprovar(usuario: AuthPayload, id: string, prioridade?: number) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
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
      `A cessão do equipamento ${atualizada.equipamento?.tombamento} para ${atualizada.entidadeExternaNome} foi aprovada. Confirme a saída do equipamento.`,
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
  if (!TIPOS_COM_ATA.includes(solicitacao.tipo) || solicitacao.status !== 'AGUARDANDO_VALIDACAO') {
    throw new AppError('Esta solicitação não está aguardando validação do Patrimônio.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
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

// FA03 — negação com motivo
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (!['PENDENTE_APROVACAO', 'AGUARDANDO_DISPONIBILIDADE'].includes(solicitacao.status)) {
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

// UC12/RF22 — unidade de origem confirma a saída (cessão externa). Como o
// destino é uma entidade externa (sem usuário no sistema), a confirmação de
// saída já conclui a solicitação — não há etapa de "destino confirma".
export async function confirmarSaida(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'CESSAO_USO' || solicitacao.status !== 'AGUARDANDO_SAIDA') {
    throw new AppError('Esta solicitação não está aguardando confirmação de saída.', 422);
  }
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeOrigemId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de origem confirma a saída.', 403);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: { status: 'CEDIDO' },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'CESSAO_USO',
        descricao: `Cessão de uso concluída: ${s.unidadeOrigem.nome} → ${s.entidadeExternaNome} (entidade externa)`,
        unidadeOrigemId: s.unidadeOrigemId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONCLUIR_CESSAO',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { equipamentoId: s.equipamentoId, entidadeExterna: s.entidadeExternaNome },
      },
      tx,
    );
    return s;
  });
  await notificar(
    atualizada.unidadeOrigem.emailBase,
    'Cessão de uso concluída',
    `O equipamento ${atualizada.equipamento?.tombamento} foi cedido a ${atualizada.entidadeExternaNome}.`,
  );
  return atualizada;
}

export interface DadosConfirmarRecebimento {
  // Empréstimo (fluxo antigo, inalterado): 5 níveis de conservação
  estadoRecebimento?: EstadoConservacao;
  // Ampliação/Substituição (feedback do cliente 17/08): OK/Não OK binário.
  // Se OK, exige o tombamento de cada item pra comparar com o cadastrado.
  ok?: boolean;
  observacao?: string;
  itens?: Array<{ equipamentoId: string; tombamentoConfirmado: string }>;
}

// UC14/RF26 — destino (interno) confirma o recebimento do empréstimo e
// avalia o estado; sem data de retorno, a transferência já é permanente (RF23).
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
    if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeOrigemId !== usuario.unidadeId) {
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

  const { estadoRecebimento } = dados;
  if (solicitacao.tipo !== 'EMPRESTIMO' || solicitacao.status !== 'AGUARDANDO_RECEBIMENTO') {
    throw new AppError('Esta solicitação não está aguardando recebimento.', 422);
  }
  if (usuario.perfil === 'UNIDADE' && solicitacao.unidadeDestinoId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade de destino confirma o recebimento.', 403);
  }
  if (!estadoRecebimento) {
    throw new AppError('Registre o estado do equipamento no recebimento.', 422);
  }

  // Transferência temporária: aguarda o retorno futuro (RF26)
  if (solicitacao.dataRetornoPrevista) {
    return prisma.solicitacao.update({
      where: { id },
      data: { status: 'AGUARDANDO_RETORNO', estadoRecebimento },
      include: includePadrao,
    });
  }

  // Transferência permanente (sem data de retorno): move o tombamento (RF23)
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA', estadoRecebimento },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: {
        unidadeId: s.unidadeDestinoId!,
        unidadeTemporariaId: null,
        status: 'ATIVO',
        estadoConservacao: estadoRecebimento,
      },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'CESSAO_USO',
        descricao: `Transferência permanente concluída: ${s.unidadeOrigem.nome} → ${s.unidadeDestino?.nome}`,
        unidadeOrigemId: s.unidadeOrigemId,
        unidadeDestinoId: s.unidadeDestinoId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONCLUIR_TRANSFERENCIA_PERMANENTE',
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
    'Transferência concluída',
    `O equipamento ${atualizada.equipamento?.tombamento} foi transferido permanentemente para ${atualizada.unidadeDestino?.nome}.`,
  );
  return atualizada;
}

// UC15/RF27 — unidade de origem confirma o retorno do empréstimo temporário
export async function confirmarRetorno(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'EMPRESTIMO' || solicitacao.status !== 'AGUARDANDO_RETORNO') {
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

// Gestor de Patrimônio marca que o pedido foi lançado no Branet — registro
// manual, sem integração real — informando o número do pedido e o tombamento
// de cada item (Ampliação: item novo; Substituição: item novo + baixa do
// antigo). Absorve o que antes era uma etapa separada do Galpão (feedback do
// cliente 17/08: quem lida com o Branet e o tombamento é o Gestor, não o Galpão).
export async function marcarLancadoBranet(
  usuario: AuthPayload,
  id: string,
  numeroPedidoBranet: string,
  itens: Array<{ tombamento: string; descricao: string; dataAquisicao?: Date }>,
) {
  const solicitacao = await buscarPorId(usuario, id);
  if (!TIPOS_COM_ATA.includes(solicitacao.tipo) || solicitacao.status !== 'RESERVADO') {
    throw new AppError('Somente solicitações de ampliação ou substituição reservadas podem ser marcadas como lançadas no Branet.', 422);
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

// Conclusão da recolha — galpão (escolhido na criação) confirma o recebimento físico
export async function confirmarRecolha(usuario: AuthPayload, id: string) {
  const solicitacao = await buscarPorId(usuario, id);
  if (solicitacao.tipo !== 'RECOLHA' || solicitacao.status !== 'AGUARDANDO_ENTREGA') {
    throw new AppError('Esta recolha não está aguardando confirmação do galpão.', 422);
  }
  const galpaoId = solicitacao.unidadeDestinoId!;
  const atualizada = await prisma.$transaction(async (tx) => {
    const s = await tx.solicitacao.update({
      where: { id },
      data: { status: 'CONCLUIDA' },
      include: includePadrao,
    });
    await tx.equipamento.update({
      where: { id: s.equipamentoId! },
      data: { unidadeId: galpaoId },
    });
    await tx.movimentacao.create({
      data: {
        equipamentoId: s.equipamentoId!,
        tipo: 'RECOLHA',
        descricao: `Equipamento recolhido ao galpão a partir de ${s.unidadeOrigem.nome}`,
        unidadeOrigemId: s.unidadeOrigemId,
        unidadeDestinoId: galpaoId,
        usuarioId: usuario.sub,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONCLUIR_RECOLHA',
        entidade: 'solicitacao',
        entidadeId: id,
        dadosDepois: { equipamentoId: s.equipamentoId, galpaoId },
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
