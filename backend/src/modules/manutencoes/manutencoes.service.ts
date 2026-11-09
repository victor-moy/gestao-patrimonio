import { comprometidoPorItem, saldoDoItem } from '../contratos/saldo';
import {
  EstadoConservacao,
  Prisma,
  StatusManutencao,
  TipoEncerramento,
  TipoManutencao,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { numeroDaBusca } from '../../lib/numero';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { notificar } from '../../services/notificacao.service';
import * as avisos from '../../services/avisos.eventos';
import { AuthPayload } from '../../middlewares/auth';

export const includePadrao = {
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
  setores: { select: { setor: { select: { id: true, nome: true } } } },
  categoriaCivil: { select: { id: true, nome: true } },
  ordemServico: { include: { documentos: { orderBy: { enviadoEm: 'asc' as const } } } },
  cotacoes: { orderBy: [{ rodada: 'asc' as const }, { enviadoEm: 'asc' as const }] },
  respostas: { select: { id: true, perguntaTexto: true, resposta: true, ordem: true }, orderBy: { ordem: 'asc' as const } },
  problemasExtras: { select: { id: true, descricao: true, fotos: true, criadoEm: true, criadoPor: { select: { nome: true } } }, orderBy: { criadoEm: 'asc' as const } },
  chamadoOriginal: { select: { id: true, numero: true, titulo: true } },
  contrato: { select: { id: true, numero: true, prestadorId: true, prestador: { select: { nome: true } } } },
  contratoItem: {
    select: { id: true, valor: true, descontoPercentual: true, servico: { select: { nome: true, exigeOrcamentoPrevio: true } } },
  },
  // Manutenção civil: serviços e materiais lançados pelo prestador
  linhasRelatorio: { orderBy: { criadoEm: 'asc' as const } },
} satisfies Prisma.ManutencaoInclude;

// Perfis que existiam antes da unificação em Administrador (ainda presentes em registros de auditoria antigos)
const PERFIS_UNIFICADOS = ['GESTOR_PATRIMONIO', 'GESTOR_MANUTENCAO'];

// Ações de auditoria que são a própria criação do chamado: não contam como interação
const ACOES_DE_CRIACAO = ['ABRIR_MANUTENCAO_CIVIL', 'ABRIR_MANUTENCAO_REENCAMINHADA', 'ABRIR_MANUTENCAO'];

// Chamados em que ninguém interagiu ainda: sem mensagem no chat e sem nenhuma ação registrada depois da abertura
async function idsSemInteracao() {
  const linhas = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT m.id FROM manutencao m
    WHERE NOT EXISTS (SELECT 1 FROM mensagem_chat c WHERE c.manutencao_id = m.id)
      AND NOT EXISTS (
        SELECT 1 FROM log_auditoria l
        WHERE l.entidade = 'manutencao' AND l.entidade_id = m.id
          AND l.acao NOT IN (${Prisma.join(ACOES_DE_CRIACAO)})
      )`;
  return (linhas ?? []).map((l) => l.id);
}

export async function listar(
  usuario: AuthPayload,
  filtros: { status?: StatusManutencao; busca?: string; tipo?: TipoManutencao; semInteracao?: boolean },
) {
  if (usuario.perfil === 'TERCEIRIZADA' && !usuario.prestadorId) return [];
  const semInteracaoIds = filtros.semInteracao ? await idsSemInteracao() : undefined;
  const prestadorId = usuario.prestadorId;
  const where: Prisma.ManutencaoWhereInput = {
    ...(usuario.perfil === 'UNIDADE' ? { unidadeId: usuario.unidadeId ?? '' } : {}),
    // Terceirizada: só as manutenções cobertas por contratos do seu prestador (o prestador vem do token)
    ...(usuario.perfil === 'TERCEIRIZADA' && prestadorId ? { contrato: { prestadorId } } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(semInteracaoIds ? { id: { in: semInteracaoIds } } : {}),
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
type ManutencaoCarregada = Prisma.ManutencaoGetPayload<{ include: typeof includePadrao }>;

function exigirCivil(m: { tipo: TipoManutencao }, acao: string) {
  if (m.tipo !== 'CIVIL') throw new AppError(`${acao} só vale para manutenção civil.`, 422);
}

function exigirEquipamento(m: ManutencaoCarregada) {
  if (!m.equipamento || !m.equipamentoId) throw new AppError('Esta manutenção civil não tem equipamento.', 422);
  return { equipamento: m.equipamento, equipamentoId: m.equipamentoId };
}

// O vínculo da manutenção é com um item de contrato (serviço); o contrato vem dele. Regras: contrato
// vigente. O saldo só é consumido no orçamento (ou no custo final) e nesse momento é conferido; a escolha do
// item na triagem não é bloqueada por saldo. A linha do item fica travada até o fim da transação. Enquanto aguarda orçamento, o Administrador pode trocar o item ou negar o chamado.
export async function vincularItem(
  tx: Prisma.TransactionClient,
  contratoItemId: string,
  manutencaoId: string,
  { valorNovo = 0, novaSelecao = true, rotulo = 'orçamento', ocultarValores = false } = {},
) {
  await tx.$queryRaw`SELECT id FROM contrato_item WHERE id = ${contratoItemId} FOR UPDATE`;
  const item = await tx.contratoItem.findUnique({
    where: { id: contratoItemId },
    select: {
      id: true,
      contratoId: true,
      valor: true,
      contrato: { select: { status: true } },
    },
  });
  if (!item) throw new AppError('Item de contrato não encontrado.', 422);
  // Vigência na escolha do item e sempre que o saldo for consumido (orçamento ou custo final civil)
  if ((novaSelecao || valorNovo > 0) && item.contrato.status === 'EXPIRADO') {
    throw new AppError('O contrato deste item está expirado.', 422);
  }
  const comprometido = (await comprometidoPorItem(tx, [item.id], manutencaoId)).get(item.id) ?? 0;
  const saldo = saldoDoItem(item.valor, comprometido);
  if (valorNovo > saldo) {
    // O prestador não vê valores: a mensagem dele não traz o total nem o saldo
    if (ocultarValores) throw new AppError(`O ${rotulo} excede o saldo do item de contrato. Fale com o fiscal do contrato.`, 422);
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
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser aprovadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const vinculo = await vincularItem(tx, contratoItemId, id);
    const servico = await tx.contratoItem.findUnique({
      where: { id: contratoItemId },
      select: { servico: { select: { exigeAvaliacaoTecnica: true, exigeOrcamentoPrevio: true } } },
    });
    // Civil com orçamento prévio obrigatório também passa pela avaliação, que é quem pede o orçamento
    const exigeAvaliacaoTecnica =
      servico?.servico?.exigeAvaliacaoTecnica === true || (civil && servico?.servico?.exigeOrcamentoPrevio === true);
    // Serviço que exige avaliação técnica: o item fica reservado, mas o chamado só vai ao prestador (contrato) depois do parecer
    const m = await tx.manutencao.update({
      where: { id },
      data: exigeAvaliacaoTecnica
        ? { status: 'AGUARDANDO_AVALIACAO_TECNICA', decididoPorId: usuario.sub, contratoItemId: vinculo.contratoItemId, informacoesSolicitadas: null }
        : { ...dadosDeEnvio(civil), decididoPorId: usuario.sub, informacoesSolicitadas: null, ...vinculo },
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
          descricao:
            m.status === 'AGUARDANDO_AVALIACAO_TECNICA'
              ? 'Manutenção aprovada — aguardando avaliação técnica'
              : 'Manutenção aprovada — equipamento encaminhado para a terceirizada',
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
  if (atualizada.status === 'AGUARDANDO_AVALIACAO_TECNICA') {
    await notificar(
      atualizada.unidade.emailBase,
      'Manutenção aprovada, em avaliação técnica',
      `O chamado ${atualizada.titulo ?? atualizada.equipamento?.tombamento ?? ''} foi aprovado e aguarda a avaliação técnica antes de ir ao prestador.`,
    );
    await avisos.avisoAvaliacaoTecnicaPendente(atualizada);
    return atualizada;
  }
  await notificarEnvio(atualizada, civil);
  return atualizada;
}

// O que muda no chamado quando ele vai ao prestador. Civil não tem orçamento: o prestador recebe o chamado para executar
function dadosDeEnvio(civil: boolean) {
  return { status: civil ? ('AGUARDANDO_EXECUCAO' as const) : ('AGUARDANDO_ORCAMENTO' as const), dataEnvio: new Date() };
}

async function notificarEnvio(m: ManutencaoCarregada, civil: boolean) {
  await notificar(
    m.unidade.emailBase,
    civil ? 'Chamado de manutenção civil encaminhado' : 'Manutenção aprovada',
    civil
      ? `O chamado ${m.titulo ?? ''} foi encaminhado ao prestador ${m.contrato?.prestador.nome ?? ''} (contrato ${m.contrato?.numero ?? ''}), responsável pelo atendimento.`
      : `A solicitação de manutenção do equipamento ${m.equipamento?.tombamento ?? ''} foi aprovada e o equipamento será encaminhado para a terceirizada.`,
  );
  await avisos.avisoManutencaoAprovada(m, civil);
}

// Manda o chamado ao prestador do contrato do item de contrato. Vale para o fim da avaliação técnica e para o triador que
// encaminha um chamado "já avaliado". A condição de status na gravação evita duas decisões ao mesmo tempo.
export async function encaminharAoPrestador(
  usuario: AuthPayload,
  id: string,
  { de, acao, parecer, contratoItemId, dispensaOrcamento }: { de: StatusManutencao; acao: string; parecer?: string; contratoItemId?: string; dispensaOrcamento?: string },
) {
  const manutencao = await buscarPorId(usuario, id);
  const itemId = contratoItemId ?? manutencao.contratoItemId;
  if (manutencao.status !== de || !itemId) {
    throw new AppError(
      de === 'AVALIADO'
        ? 'Somente chamados já avaliados e devolvidos à triagem podem ser encaminhados.'
        : 'Somente chamados aguardando avaliação técnica podem ter a avaliação concluída.',
      422,
    );
  }
  const civil = manutencao.tipo === 'CIVIL';
  const atualizada = await prisma.$transaction(async (tx) => {
    // Serviço que exige orçamento prévio: só segue com orçamento aprovado ou dispensa por risco à vida
    if (civil && !dispensaOrcamento && !manutencao.dispensaOrcamentoMotivo && !manutencao.cotacaoAprovadaId) {
      const exige = await tx.contratoItem.findUnique({ where: { id: itemId }, select: { servico: { select: { exigeOrcamentoPrevio: true } } } });
      if (exige?.servico?.exigeOrcamentoPrevio) {
        throw new AppError('Este serviço exige orçamento prévio. Solicite o orçamento ou, em risco à vida, encaminhe justificando.', 422);
      }
    }
    const { contratoItemId: item, contratoId } = await vincularItem(tx, itemId, id, { novaSelecao: itemId !== manutencao.contratoItemId });
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: de },
      data: { ...dadosDeEnvio(civil), contratoItemId: item, contratoId, ...(parecer ? { parecerTecnico: parecer } : {}), ...(dispensaOrcamento ? { dispensaOrcamentoMotivo: dispensaOrcamento } : {}) },
    });
    if (gravado.count === 0) throw new AppError('Este chamado já mudou de situação. Atualize a página.', 409);
    const m = await tx.manutencao.findUnique({ where: { id }, include: includePadrao });
    if (!m) throw new AppError('Manutenção não encontrada.', 404);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao,
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: m.status, contratoId, ...(dispensaOrcamento ? { dispensaOrcamento } : {}) },
      },
      tx,
    );
    return m;
  });
  await notificarEnvio(atualizada, civil);
  return atualizada;
}

// Avaliação técnica concluída por quem tem a permissão: o chamado segue ao prestador do contrato do item escolhido
export const concluirAvaliacaoTecnica = (usuario: AuthPayload, id: string, parecer: string) =>
  encaminharAoPrestador(usuario, id, { de: 'AGUARDANDO_AVALIACAO_TECNICA', acao: 'CONCLUIR_AVALIACAO_TECNICA', parecer });

// Fila "já avaliados": o triador atribui o chamado ao prestador (pode trocar o item de contrato)
export const encaminharAvaliado = (usuario: AuthPayload, id: string, contratoItemId?: string) =>
  encaminharAoPrestador(usuario, id, { de: 'AVALIADO', acao: 'ENCAMINHAR_CHAMADO_AVALIADO', contratoItemId });

// Mudança de situação feita só com a condição de status na gravação (sem corrida) e com auditoria
async function mudarSituacao(
  usuario: AuthPayload,
  id: string,
  { de, para, acao, dados }: { de: StatusManutencao; para: StatusManutencao; acao: string; dados: Prisma.ManutencaoUpdateManyMutationInput & { contratoItemId?: null } },
) {
  const gravado = await prisma.$transaction(async (tx) => {
    const r = await tx.manutencao.updateMany({ where: { id, status: de }, data: { status: para, ...dados } });
    if (r.count === 0) throw new AppError('Este chamado já mudou de situação. Atualize a página.', 409);
    await registrarAuditoria(
      { usuarioId: usuario.sub, acao, entidade: 'manutencao', entidadeId: id, dadosAntes: { status: de }, dadosDepois: { status: para } },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  return gravado;
}

// Saída 2: aprovado, mas quem atribui ao prestador é o triador. O chamado entra na fila "já avaliados".
export async function devolverAvaliadoATriagem(usuario: AuthPayload, id: string, parecer: string) {
  const m = await buscarPorId(usuario, id);
  exigirEmAvaliacao(m);
  if (!m.contratoItemId) throw new AppError('Escolha o item de contrato antes de devolver à triagem.', 422);
  const atualizada = await mudarSituacao(usuario, id, {
    de: 'AGUARDANDO_AVALIACAO_TECNICA',
    para: 'AVALIADO',
    acao: 'DEVOLVER_AVALIADO_A_TRIAGEM',
    dados: { parecerTecnico: parecer },
  });
  await avisos.avisoChamadoAvaliado(atualizada);
  return atualizada;
}

// Saída 3: faltam informações. Volta à triagem, que fala com o solicitante pelo chat; a escolha do item é refeita.
export async function solicitarInformacoes(usuario: AuthPayload, id: string, motivo: string) {
  const m = await buscarPorId(usuario, id);
  exigirEmAvaliacao(m);
  const atualizada = await mudarSituacao(usuario, id, {
    de: 'AGUARDANDO_AVALIACAO_TECNICA',
    para: 'PENDENTE_APROVACAO',
    acao: 'SOLICITAR_INFORMACOES_AVALIACAO',
    dados: { informacoesSolicitadas: motivo, contratoItemId: null },
  });
  await avisos.avisoInformacoesSolicitadas(atualizada, motivo);
  return atualizada;
}

// Saída 4: precisa ir à unidade. O chamado fica aguardando a vistoria, que não vai ao prestador.
export async function marcarVistoria(usuario: AuthPayload, id: string) {
  const m = await buscarPorId(usuario, id);
  exigirEmAvaliacao(m);
  return mudarSituacao(usuario, id, { de: 'AGUARDANDO_AVALIACAO_TECNICA', para: 'AGUARDANDO_VISTORIA', acao: 'MARCAR_VISTORIA', dados: {} });
}

// Depois da visita, o parecer é registrado e o chamado volta à avaliação, que decide de novo
export async function registrarVistoria(usuario: AuthPayload, id: string, parecer: string) {
  const m = await buscarPorId(usuario, id);
  if (m.status !== 'AGUARDANDO_VISTORIA') throw new AppError('Este chamado não está aguardando vistoria.', 422);
  return mudarSituacao(usuario, id, {
    de: 'AGUARDANDO_VISTORIA',
    para: 'AGUARDANDO_AVALIACAO_TECNICA',
    acao: 'REGISTRAR_VISTORIA',
    dados: { parecerVistoria: parecer },
  });
}

// ---- Avaliação técnica: o avaliador confere e corrige o chamado, define o prestador (item de contrato), escolhe os
// materiais previstos e decide o destino (seguir em análise, encaminhar, encerrar, duplicado, unificado).

type Dados = Record<string, unknown>;

// O texto do local afetado guarda os nomes dos setores, separados por vírgula
const textoDosSetores = (nomes: string[]) => nomes.join(', ').slice(0, 200);

function exigirEmAvaliacao(m: { status: StatusManutencao }) {
  if (m.status !== 'AGUARDANDO_AVALIACAO_TECNICA') {
    throw new AppError('Este chamado não está aguardando avaliação técnica.', 422);
  }
}

export interface EdicaoAvaliacao {
  titulo?: string;
  descricaoProblema?: string;
  unidadeId?: string;
  equipamentoId?: string;
  localAfetado?: string | null;
  categoriaCivilId?: string | null;
  setorIds?: string[];
  contratoItemId?: string;
  orientacoesTerceirizada?: string | null;
  parecerTecnico?: string | null;
}

// "Em análise": grava as correções e continua na avaliação. Todos os campos do chamado podem ser corrigidos.
export async function editarAvaliacao(usuario: AuthPayload, id: string, dados: EdicaoAvaliacao) {
  const manutencao = await buscarPorId(usuario, id);
  exigirEmAvaliacao(manutencao);
  const civil = manutencao.tipo === 'CIVIL';
  if (!civil && (dados.localAfetado !== undefined || dados.categoriaCivilId !== undefined)) {
    throw new AppError('Local afetado e tipo de problema só valem para manutenção civil.', 422);
  }
  if (civil && dados.equipamentoId !== undefined) {
    throw new AppError('A manutenção civil não tem equipamento.', 422);
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
    exigirEmAvaliacao(atual);
    const dadosNovos: Prisma.ManutencaoUncheckedUpdateInput = {};
    const antes: Dados = {};
    const depois: Dados = {};
    const mudou = (campo: string, valorAntes: unknown, valorDepois: unknown) => {
      antes[campo] = valorAntes ?? null;
      depois[campo] = valorDepois ?? null;
    };

    let unidadeId = atual.unidadeId;
    if (dados.equipamentoId !== undefined && dados.equipamentoId !== atual.equipamentoId) {
      const novo = await tx.equipamento.findUnique({ where: { id: dados.equipamentoId } });
      if (!novo) throw new AppError('Equipamento não encontrado.', 404);
      if (novo.status !== 'ATIVO') {
        throw new AppError(`O equipamento está com status ${novo.status} e não pode receber manutenção.`, 422);
      }
      // O equipamento antigo volta a ficar ativo; o novo passa a "em manutenção" e a unidade é a dele
      if (atual.equipamentoId) {
        await liberarEquipamento(tx, atual.equipamentoId, atual.unidadeId, usuario.sub, 'Equipamento trocado na avaliação técnica do chamado.');
      }
      await tx.equipamento.update({ where: { id: novo.id }, data: { status: 'EM_MANUTENCAO' } });
      await tx.movimentacao.create({
        data: {
          equipamentoId: novo.id,
          tipo: 'ENVIO_MANUTENCAO',
          descricao: 'Manutenção aprovada — aguardando avaliação técnica',
          unidadeOrigemId: novo.unidadeId,
          usuarioId: usuario.sub,
        },
      });
      dadosNovos.equipamentoId = novo.id;
      mudou('equipamentoId', atual.equipamentoId, novo.id);
      unidadeId = novo.unidadeId;
    } else if (dados.unidadeId !== undefined && dados.unidadeId !== atual.unidadeId) {
      if (!(await tx.unidade.findUnique({ where: { id: dados.unidadeId }, select: { id: true } }))) {
        throw new AppError('Unidade não encontrada.', 422);
      }
      unidadeId = dados.unidadeId;
    }
    if (unidadeId !== atual.unidadeId) {
      dadosNovos.unidadeId = unidadeId;
      mudou('unidadeId', atual.unidadeId, unidadeId);
    }

    // Os setores precisam ser da unidade final; trocar de unidade sem indicar outros setores limpa a lista
    const idsAtuais = atual.setores.map((x) => x.setor.id);
    let idsFinais = dados.setorIds ?? idsAtuais;
    let nomesSetores: string[] | null = null;
    if (idsFinais.length > 0) {
      const encontrados = await tx.setor.findMany({ where: { id: { in: idsFinais } } });
      const invalido = encontrados.length !== new Set(idsFinais).size || encontrados.some((x) => !x.ativo || x.unidadeId !== unidadeId);
      if (invalido) {
        if (dados.setorIds !== undefined) throw new AppError('Algum setor não existe ou não pertence à unidade do chamado.', 422);
        idsFinais = [];
      } else {
        nomesSetores = encontrados.map((x) => x.nome);
      }
    }
    const mudouSetores = idsFinais.length !== idsAtuais.length || idsFinais.some((i) => !idsAtuais.includes(i));
    if (mudouSetores) {
      await tx.manutencaoSetor.deleteMany({ where: { manutencaoId: id } });
      if (idsFinais.length > 0) {
        await tx.manutencaoSetor.createMany({ data: idsFinais.map((setorId) => ({ manutencaoId: id, setorId })) });
      }
      mudou('setorIds', idsAtuais, idsFinais);
    }

    if (dados.contratoItemId !== undefined && dados.contratoItemId !== atual.contratoItemId) {
      // O item define o prestador; confere vigência e saldo. O chamado só chega ao prestador ao encaminhar
      const vinculo = await vincularItem(tx, dados.contratoItemId, id);
      dadosNovos.contratoItemId = vinculo.contratoItemId;
      mudou('contratoItemId', atual.contratoItemId, vinculo.contratoItemId);
      // Os materiais previstos usam o desconto do item: recalcula os preços das linhas
      const novoItem = await tx.contratoItem.findUnique({ where: { id: vinculo.contratoItemId }, select: { descontoPercentual: true } });
      const desconto = Number(novoItem?.descontoPercentual ?? 0);
      for (const linha of atual.linhasRelatorio) {
        if (linha.precoSinapi === null) continue;
        await tx.linhaRelatorioManutencao.update({
          where: { id: linha.id },
          data: { descontoPercentual: desconto, valorUnitario: arredondar(Number(linha.precoSinapi) * (1 - desconto / 100)) },
        });
      }
    }

    const simples = ['titulo', 'descricaoProblema', 'localAfetado', 'categoriaCivilId', 'orientacoesTerceirizada', 'parecerTecnico'] as const;
    for (const campo of simples) {
      const novo = dados[campo];
      if (novo === undefined) continue;
      const valor = typeof novo === 'string' ? (novo.trim() === '' ? null : novo.trim()) : novo;
      if (valor === atual[campo]) continue;
      if (campo === 'descricaoProblema' && valor === null) throw new AppError('A descrição do problema é obrigatória.', 422);
      (dadosNovos as Dados)[campo] = valor;
      mudou(campo, atual[campo], valor);
    }

    // No chamado civil o texto do local acompanha os setores escolhidos (listas e buscas usam esse texto)
    if (civil && mudouSetores && nomesSetores) {
      dadosNovos.localAfetado = textoDosSetores(nomesSetores);
      mudou('localAfetado', atual.localAfetado, dadosNovos.localAfetado);
    }

    if (Object.keys(dadosNovos).length > 0 || mudouSetores) {
      if (Object.keys(dadosNovos).length > 0) await tx.manutencao.update({ where: { id }, data: dadosNovos });
      await registrarAuditoria(
        { usuarioId: usuario.sub, acao: 'EDITAR_AVALIACAO_TECNICA', entidade: 'manutencao', entidadeId: id, dadosAntes: antes, dadosDepois: depois },
        tx,
      );
    }
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

// Materiais previstos para o reparo (tabela SINAPI): entram como linhas do relatório, que o prestador ajusta ao executar
export async function adicionarMaterialAvaliacao(usuario: AuthPayload, id: string, dados: { itemSinapiId: string; quantidade: number }) {
  const manutencao = await buscarPorId(usuario, id);
  exigirEmAvaliacao(manutencao);
  exigirCivil(manutencao, 'A lista de materiais');
  if (!manutencao.contratoItem) throw new AppError('Escolha o item de contrato antes: é dele o desconto aplicado.', 422);
  const itemSinapi = await prisma.itemSinapi.findUnique({ where: { id: dados.itemSinapiId } });
  if (!itemSinapi || !itemSinapi.ativo) throw new AppError('Item da tabela SINAPI não encontrado.', 404);
  const desconto = Number(manutencao.contratoItem.descontoPercentual);
  const precoSinapi = Number(itemSinapi.preco);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, include: { _count: { select: { linhasRelatorio: true } } } });
    exigirEmAvaliacao(atual);
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
        valorUnitario: arredondar(precoSinapi * (1 - desconto / 100)),
        itemSinapiId: itemSinapi.id,
        codigoSinapi: itemSinapi.codigo,
        precoSinapi,
        descontoPercentual: desconto,
      },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'INCLUIR_MATERIAL_AVALIACAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { codigoSinapi: itemSinapi.codigo, descricao: itemSinapi.descricao, quantidade: dados.quantidade },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

export async function removerMaterialAvaliacao(usuario: AuthPayload, id: string, linhaId: string) {
  const manutencao = await buscarPorId(usuario, id);
  exigirEmAvaliacao(manutencao);
  const linha = manutencao.linhasRelatorio.find((l) => l.id === linhaId);
  if (!linha) throw new AppError('Material não encontrado.', 404);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({ where: { id }, select: { status: true } });
    exigirEmAvaliacao(atual);
    const apagada = await tx.linhaRelatorioManutencao.deleteMany({ where: { id: linhaId, manutencaoId: id } });
    if (apagada.count === 0) throw new AppError('Material não encontrado.', 404);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REMOVER_MATERIAL_AVALIACAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { descricao: linha.descricao },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

// Encerra o chamado na avaliação: sem atendimento (encerrado) ou por já existir outro (duplicado, unificado)
export async function encerrarNaAvaliacao(
  usuario: AuthPayload,
  id: string,
  dados: { tipo: TipoEncerramento; motivo: string; chamadoOriginalNumero?: number },
) {
  const manutencao = await buscarPorId(usuario, id);
  exigirEmAvaliacao(manutencao);
  const remete = dados.tipo !== 'ENCERRADO';
  if (remete && dados.chamadoOriginalNumero === undefined) {
    throw new AppError('Informe o número do chamado original.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    let chamadoOriginalId: string | null = null;
    if (remete) {
      const original = await tx.manutencao.findUnique({ where: { numero: dados.chamadoOriginalNumero as number } });
      if (!original) throw new AppError('Chamado original não encontrado.', 422);
      if (original.id === id) throw new AppError('O chamado original não pode ser o próprio chamado.', 422);
      if (['NEGADA', 'ENCERRADA'].includes(original.status)) {
        throw new AppError('O chamado original já está negado ou encerrado.', 422);
      }
      chamadoOriginalId = original.id;
    }
    // Condição de status na gravação: decisões concorrentes não passam
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
      data: {
        status: 'ENCERRADA',
        tipoEncerramento: dados.tipo,
        motivoEncerramento: dados.motivo,
        chamadoOriginalId,
        decididoPorId: usuario.sub,
      },
    });
    if (gravado.count === 0) throw new AppError('Este chamado já saiu da avaliação técnica.', 409);
    if (manutencao.equipamentoId) {
      await liberarEquipamento(tx, manutencao.equipamentoId, manutencao.unidadeId, usuario.sub, `Chamado encerrado na avaliação técnica. Motivo: ${dados.motivo}`);
    }
    const m = await tx.manutencao.findUnique({ where: { id }, include: includePadrao });
    if (!m) throw new AppError('Manutenção não encontrada.', 404);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ENCERRAR_NA_AVALIACAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'ENCERRADA', tipo: dados.tipo, motivo: dados.motivo, chamadoOriginalId },
      },
      tx,
    );
    return m;
  });
  await notificar(
    atualizada.unidade.emailBase,
    'Chamado encerrado',
    `O chamado ${atualizada.titulo ?? atualizada.equipamento?.tombamento ?? ''} foi encerrado na avaliação técnica. Motivo: ${dados.motivo}`,
  );
  await avisos.avisoManutencaoEncerrada(atualizada, dados.motivo);
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
      ...(manutencao.categoriaCivilId ? { categoriaCivilId: manutencao.categoriaCivilId } : {}),
      status: { notIn: ['NEGADA', 'ENCERRADA', 'CONCLUIDA', 'BAIXADO'] },
    },
    select: { id: true, numero: true, titulo: true, status: true, abertoPorContestacao: true, localAfetado: true, criadoEm: true },
    orderBy: { criadoEm: 'desc' },
    take: 10,
  });
}

// Devolve o equipamento a ativo se ele ainda estiver em manutenção (condição na gravação, sem corrida) e registra o retorno
export async function liberarEquipamento(tx: Prisma.TransactionClient, equipamentoId: string, unidadeId: string, usuarioId: string, descricao: string) {
  const liberado = await tx.equipamento.updateMany({ where: { id: equipamentoId, status: 'EM_MANUTENCAO' }, data: { status: 'ATIVO' } });
  if (liberado.count > 0) {
    await tx.movimentacao.create({
      data: { equipamentoId, tipo: 'RETORNO_MANUTENCAO', descricao, unidadeDestinoId: unidadeId, usuarioId },
    });
  }
}

// Status em que a triagem pode bloquear o chamado (antes da execução). Bloqueado mantém equipamento e saldo reservados
const BLOQUEAVEIS: StatusManutencao[] = ['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'AGUARDANDO_EXECUCAO'];

export async function bloquear(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (!BLOQUEAVEIS.includes(manutencao.status)) {
    throw new AppError('Só é possível bloquear o chamado antes da execução.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    // A condição de status na gravação recusa decisões concorrentes
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: manutencao.status },
      data: { status: 'BLOQUEADO', statusAntesBloqueio: manutencao.status, motivoBloqueio: motivo, bloqueadoEm: new Date() },
    });
    if (gravado.count === 0) throw new AppError('O chamado mudou de status. Atualize a página e tente de novo.', 409);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'BLOQUEAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'BLOQUEADO', motivo },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  return atualizada;
}

export async function desbloquear(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'BLOQUEADO' || !manutencao.statusAntesBloqueio) {
    throw new AppError('O chamado não está bloqueado.', 422);
  }
  const volta = manutencao.statusAntesBloqueio;
  const parado = manutencao.bloqueadoEm ? Math.max(0, Math.round((Date.now() - manutencao.bloqueadoEm.getTime()) / 1000)) : 0;
  return prisma.$transaction(async (tx) => {
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'BLOQUEADO' },
      data: {
        status: volta,
        statusAntesBloqueio: null,
        motivoBloqueio: null,
        bloqueadoEm: null,
        tempoBloqueadoSegundos: { increment: parado },
      },
    });
    if (gravado.count === 0) throw new AppError('O chamado mudou de status. Atualize a página e tente de novo.', 409);
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'DESBLOQUEAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: 'BLOQUEADO', motivo: manutencao.motivoBloqueio },
        dadosDepois: { status: volta, segundosParado: parado },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

// FA01 — negação com motivo, só na triagem
export async function negar(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  // Civil: com o chamado nas mãos do prestador o Administrador não o nega
  if (manutencao.tipo === 'CIVIL' && manutencao.status === 'AGUARDANDO_EXECUCAO') {
    throw new AppError('O chamado está com o prestador, aguardando execução. Só é possível negar na triagem.', 422);
  }
  if (manutencao.status !== 'PENDENTE_APROVACAO') {
    throw new AppError('Somente solicitações pendentes podem ser negadas.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: { status: 'NEGADA', motivoNegacao: motivo, decididoPorId: usuario.sub },
      include: includePadrao,
    });
    if (manutencao.reencaminhadoDeId && m.equipamentoId) {
      // Chamado reencaminhado para o mesmo equipamento: ele seguia bloqueado desde o atendimento anterior
      await liberarEquipamento(tx, m.equipamentoId, m.unidadeId, usuario.sub, `Manutenção reencaminhada negada na triagem. Motivo: ${motivo}`);
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
  await avisos.avisoManutencaoNegada(atualizada, motivo);
  return atualizada;
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
      ? await vincularItem(tx, manutencao.contratoItemId, id, {
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
  }).then(async (atualizada) => {
    await avisos.avisoOrcamentoRegistrado(atualizada);
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
    await avisos.avisoOrcamentoDecidido(m, true);
    return m;
  }
  // FA02 — orçamento rejeitado: laudo de baixa obrigatório
  if (!dados.laudoBaixa) {
    throw new AppError('Para rejeitar o orçamento é obrigatório informar o laudo de baixa.', 422);
  }
  const baixada = await emitirBaixa(usuario, manutencao.id, dados.laudoBaixa);
  await avisos.avisoOrcamentoDecidido(baixada, false);
  return baixada;
}

// RF16/RF17/RN07/FA02 — laudo de baixa + solicitação automática de novo item
export async function emitirBaixa(usuario: AuthPayload, id: string, laudo: string) {
  const manutencao = await prisma.manutencao.findUnique({
    where: { id },
    include: includePadrao,
  });
  if (!manutencao) throw new AppError('Manutenção não encontrada.', 404);
  if (['CONCLUIDA', 'NEGADA', 'ENCERRADA', 'BAIXADO'].includes(manutencao.status)) {
    throw new AppError('Esta manutenção já foi encerrada.', 422);
  }
  const { equipamento, equipamentoId } = exigirEquipamento(manutencao);
  const resultado = await prisma.$transaction(async (tx) => {
    // O status lido precisa continuar valendo: duas baixas simultâneas não geram duas substituições
    const m = await tx.manutencao.update({
      where: { id, status: manutencao.status },
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
        manutencaoOrigemId: id,
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
    return { m, solicitacaoId: solicitacaoAutomatica.id };
  }).catch((erro: unknown) => {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2025') {
      throw new AppError('Esta manutenção mudou de situação enquanto a baixa era emitida. Atualize a página.', 409);
    }
    throw erro;
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
      `O equipamento ${equipamento.tombamento} foi baixado por impossibilidade de manutenção e uma solicitação de substituição foi aberta automaticamente para a unidade ${resultado.m.unidade.nome}.`,
    );
  }
  await notificar(
    resultado.m.unidade.emailBase,
    'Equipamento baixado',
    `O equipamento ${equipamento.tombamento} foi baixado por impossibilidade de manutenção. Uma solicitação de substituição foi aberta automaticamente.`,
  );
  await avisos.avisoEquipamentoBaixado(resultado.m, equipamento.tombamento, resultado.solicitacaoId);
  return resultado.m;
}

// Terceirizada devolveu o equipamento — aguarda a confirmação dupla
export async function registrarRetorno(usuario: AuthPayload, id: string, custoFinal?: number, execucao?: DadosExecucao) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'EM_EXECUCAO') {
    throw new AppError('Somente manutenções em execução podem registrar retorno.', 422);
  }
  if (manutencao.tipo === 'CIVIL') return finalizarCivil(usuario, manutencao, execucao);
  if (manutencao.orcamentoValor === null) {
    throw new AppError('Não há orçamento aprovado para registrar o retorno.', 422);
  }
  const orcamento = Number(manutencao.orcamentoValor);
  // Zero não é custo real: o saldo do item cairia no COALESCE e devolveria o valor do orçamento.
  if (custoFinal !== undefined && custoFinal > orcamento) {
    throw new AppError('O custo final não pode ser maior que o orçamento aprovado.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const m = await tx.manutencao.update({
      where: { id },
      data: {
        status: 'AGUARDANDO_RETORNO',
        aguardandoRetornoEm: new Date(),
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
    return m;
  });
  await avisos.avisoReparoConcluido(atualizada);
  return atualizada;
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
  if (usuario.perfil === 'UNIDADE' && !ambosConfirmaram) {
    await avisos.avisoRetornoConfirmadoUnidade(atualizada, atualizada.unidade.nome);
  }
  return atualizada;
}

// ---------------------------------------------------------------------------------------------------------------
// Manutenção civil: abertura, relatório do prestador, contestação e conferência para medição
// ---------------------------------------------------------------------------------------------------------------

// A categoria precisa estar ativa e as respostas seguem as perguntas ativas dela: obrigatórias respondidas e, nas
// perguntas de opções, só valem as opções cadastradas. O texto da pergunta é guardado junto com a resposta.
async function validarRespostas(categoriaId: string, respostas: Record<string, string>) {
  const categoria = await prisma.categoriaCivil.findUnique({
    where: { id: categoriaId },
    select: { ativo: true, perguntas: { where: { ativo: true }, orderBy: { ordem: 'asc' } } },
  });
  if (!categoria?.ativo) throw new AppError('Tipo de problema não encontrado ou desativado.', 422);
  const conhecidas = new Set(categoria.perguntas.map((p) => p.id));
  if (Object.keys(respostas).some((id) => !conhecidas.has(id))) {
    throw new AppError('Há resposta para uma pergunta que não pertence a este tipo de problema.', 422);
  }
  const linhas: Array<{ perguntaId: string; perguntaTexto: string; resposta: string; ordem: number }> = [];
  for (const p of categoria.perguntas) {
    const resposta = (respostas[p.id] ?? '').trim();
    if (!resposta) {
      if (p.obrigatoria) throw new AppError(`Responda: ${p.texto}`, 422);
      continue;
    }
    if (p.tipo === 'OPCOES' && !p.opcoes.includes(resposta)) {
      throw new AppError(`Resposta inválida para: ${p.texto}`, 422);
    }
    linhas.push({ perguntaId: p.id, perguntaTexto: p.texto, resposta, ordem: p.ordem });
  }
  return linhas;
}

// Chamados civis em aberto da mesma unidade e categoria, mostrados na abertura para evitar chamado repetido.
// `aceitaProblemas` diz em quais ainda dá para acrescentar outro problema (antes de ir ao prestador).
const STATUS_QUE_ACEITAM_PROBLEMA: StatusManutencao[] = ['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO'];

export async function abertosDaCategoria(usuario: AuthPayload, categoriaCivilId: string, unidadeIdPedida?: string) {
  const unidadeId = usuario.perfil === 'UNIDADE' ? usuario.unidadeId : unidadeIdPedida;
  if (!unidadeId) throw new AppError('Informe a unidade.', 422);
  const abertos = await prisma.manutencao.findMany({
    where: { tipo: 'CIVIL', unidadeId, categoriaCivilId, status: { notIn: ['NEGADA', 'ENCERRADA', 'CONCLUIDA', 'BAIXADO'] } },
    select: { id: true, numero: true, titulo: true, status: true, abertoPorContestacao: true, localAfetado: true, criadoEm: true },
    orderBy: { criadoEm: 'desc' },
    take: 10,
  });
  return abertos.map((m) => ({ ...m, aceitaProblemas: STATUS_QUE_ACEITAM_PROBLEMA.includes(m.status) }));
}

const MAX_PROBLEMAS_EXTRAS = 20;

// Acrescenta outro problema da mesma categoria a um chamado civil que ainda não foi ao prestador
export async function adicionarProblema(usuario: AuthPayload, id: string, dados: { descricao: string; fotos: string[] }) {
  const manutencao = await buscarPorId(usuario, id); // a Unidade só alcança chamados da própria unidade
  exigirCivil(manutencao, 'Acrescentar um problema');
  if (!STATUS_QUE_ACEITAM_PROBLEMA.includes(manutencao.status)) {
    throw new AppError('Este chamado já foi encaminhado ao prestador. Abra um novo chamado.', 422);
  }
  return prisma.$transaction(async (tx) => {
    // Trava o chamado: a decisão da triagem não pode correr junto com a inclusão
    await tx.$queryRaw`SELECT id FROM manutencao WHERE id = ${id} FOR UPDATE`;
    const atual = await tx.manutencao.findUniqueOrThrow({
      where: { id },
      select: { status: true, _count: { select: { problemasExtras: true } } },
    });
    if (!STATUS_QUE_ACEITAM_PROBLEMA.includes(atual.status)) {
      throw new AppError('Este chamado já foi encaminhado ao prestador. Abra um novo chamado.', 422);
    }
    if (atual._count.problemasExtras >= MAX_PROBLEMAS_EXTRAS) {
      throw new AppError(`O chamado aceita no máximo ${MAX_PROBLEMAS_EXTRAS} problemas acrescentados.`, 422);
    }
    const problema = await tx.manutencaoProblema.create({
      data: { manutencaoId: id, descricao: dados.descricao, fotos: dados.fotos, criadoPorId: usuario.sub },
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ADICIONAR_PROBLEMA_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { problemaId: problema.id, fotos: dados.fotos.length },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

export async function solicitarCivil(
  usuario: AuthPayload,
  dados: {
    titulo: string;
    descricaoProblema: string;
    localAfetado?: string;
    setorIds?: string[];
    categoriaCivilId: string;
    respostas?: Record<string, string>;
    unidadeId?: string;
    fotos: string[];
  },
) {
  // A Unidade abre sempre para a própria unidade (vem do token); só o Administrador escolhe outra
  const unidadeId = usuario.perfil === 'UNIDADE' ? usuario.unidadeId : (dados.unidadeId ?? null);
  if (!unidadeId) throw new AppError('Informe a unidade do chamado.', 422);
  const unidade = await prisma.unidade.findUnique({ where: { id: unidadeId }, select: { id: true } });
  if (!unidade) throw new AppError('Unidade não encontrada.', 404);
  // O local é indicado pelos setores da unidade (um ou mais). Só quando a unidade ainda não tem setores cadastrados vale o texto livre
  const ids = Array.from(new Set(dados.setorIds ?? []));
  const setores = ids.length ? await prisma.setor.findMany({ where: { id: { in: ids }, unidadeId, ativo: true } }) : [];
  if (setores.length !== ids.length) throw new AppError('Algum setor não existe ou não pertence à unidade.', 422);
  let localAfetado = setores.length ? textoDosSetores(setores.map((x) => x.nome)) : (dados.localAfetado ?? '').trim();
  if (setores.length === 0) {
    if ((await prisma.setor.count({ where: { unidadeId, ativo: true } })) > 0) {
      throw new AppError('Selecione ao menos um setor afetado.', 422);
    }
    if (localAfetado.length < 2) throw new AppError('Informe o local afetado.', 422);
  }
  localAfetado = localAfetado.slice(0, 200);
  const respostas = await validarRespostas(dados.categoriaCivilId, dados.respostas ?? {});
  const manutencao = await prisma.$transaction(async (tx) => {
    const criada = await tx.manutencao.create({
      data: {
        tipo: 'CIVIL',
        unidadeId,
        solicitanteId: usuario.sub,
        titulo: dados.titulo.trim(),
        descricaoProblema: dados.descricaoProblema,
        localAfetado,
        categoriaCivilId: dados.categoriaCivilId,
        fotos: dados.fotos,
        setores: { create: setores.map((x) => ({ setorId: x.id })) },
        respostas: { create: respostas },
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ABRIR_MANUTENCAO_CIVIL',
        entidade: 'manutencao',
        entidadeId: criada.id,
        dadosDepois: { unidadeId, categoriaCivilId: dados.categoriaCivilId, fotos: dados.fotos.length, respostas: respostas.length },
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

// O prestador confirma a finalização informando os serviços e materiais executados. O total vira o custo do
// chamado e é conferido contra o saldo do item de contrato. Na primeira finalização (ou após contestação da
// Unidade) o chamado aguarda a Unidade; se o Administrador tinha pedido ajustes, volta direto à aprovação final.
// O que o prestador informa ao marcar o serviço como executado (horários na unidade, resultado e observação)
export interface DadosExecucao {
  entradaEm: Date;
  saidaEm: Date;
  resultado: 'TOTAL' | 'PARCIAL';
  observacao?: string;
}

async function finalizarCivil(usuario: AuthPayload, manutencao: ManutencaoCarregada, execucao?: DadosExecucao) {
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
    // Primeira execução: o serviço fica "Executado" e a OS assinada e o relatório podem chegar depois
    const statusDestino = aposAjustesAdmin ? 'AGUARDANDO_MEDICAO' : 'EXECUTADO';
    const ordem = await tx.ordemServico.findUnique({ where: { manutencaoId: id }, select: { id: true } });
    if (!ordem) throw new AppError('Gere a ordem de serviço antes de marcar o serviço como executado.', 422);
    if (!aposAjustesAdmin && !execucao) {
      throw new AppError('Informe a entrada, a saída e o resultado da execução.', 422);
    }
    // Chamado antigo, sem item de contrato, não tem saldo a conferir
    const vinculo = atual.contratoItemId
      ? await vincularItem(tx, atual.contratoItemId, id, {
          valorNovo: total,
          novaSelecao: false,
          rotulo: 'valor dos serviços executados',
          ocultarValores: true,
        })
      : {};
    const mudou = await tx.manutencao.updateMany({
      where: { id, status: 'EM_EXECUCAO' },
      data: {
        status: statusDestino,
        aguardandoRetornoEm: null,
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
    if (execucao) {
      if (execucao.saidaEm <= execucao.entradaEm) throw new AppError('A saída precisa ser depois da entrada.', 422);
      if (execucao.saidaEm.getTime() > Date.now() + 5 * 60_000) throw new AppError('A saída não pode estar no futuro.', 422);
      await tx.ordemServico.update({
        where: { id: ordem.id },
        data: {
          entradaEm: execucao.entradaEm,
          saidaEm: execucao.saidaEm,
          resultado: execucao.resultado,
          observacaoExecucao: execucao.observacao?.trim() || null,
          executadaEm: new Date(),
        },
      });
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
    await avisos.avisoMedicaoAguardando(atualizada, 'o prestador reenviou os serviços após os ajustes');
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
  await avisos.avisoAjustesSolicitados(atualizada, motivo);
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
  await avisos.avisoMedicaoAguardando(atualizada, `a unidade ${atualizada.unidade.nome} confirmou a resolução`);
  return atualizada;
}

// Prazo, em dias corridos, para a Unidade responder se o problema foi resolvido
export const DIAS_PARA_CONFIRMAR_RESOLUCAO = 7;

// A Unidade não respondeu a tempo: o chamado civil é dado como resolvido e segue para a aprovação final do
// Administrador, igual à confirmação da Unidade. A condição de status na gravação evita corrida com a resposta dela.
// Devolve false quando outra ação mudou o chamado no meio.
export async function resolverSemResposta(id: string): Promise<boolean> {
  const agora = new Date();
  const atualizada = await prisma.$transaction(async (tx) => {
    const gravado = await tx.manutencao.updateMany({
      where: { id, tipo: 'CIVIL', status: 'AGUARDANDO_RETORNO' },
      data: { status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true, resolvidoAutomaticamenteEm: agora },
    });
    if (gravado.count === 0) return null;
    await registrarAuditoria(
      {
        acao: 'RESOLVER_AUTOMATICAMENTE',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: 'AGUARDANDO_RETORNO' },
        dadosDepois: { status: 'AGUARDANDO_MEDICAO', semRespostaHaDias: DIAS_PARA_CONFIRMAR_RESOLUCAO },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  if (!atualizada) return false;
  await notificar(
    atualizada.unidade.emailBase,
    'Chamado dado como resolvido',
    `O chamado ${atualizada.titulo ?? ''} foi dado como resolvido porque a unidade não respondeu em ${DIAS_PARA_CONFIRMAR_RESOLUCAO} dias.`,
  );
  await avisos.avisoMedicaoAguardando(
    atualizada,
    `a unidade ${atualizada.unidade.nome} não respondeu em ${DIAS_PARA_CONFIRMAR_RESOLUCAO} dias e o chamado foi dado como resolvido`,
  );
  return true;
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
