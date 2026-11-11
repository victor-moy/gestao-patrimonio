import { Prisma, StatusManutencao, TipoManutencao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import * as avisos from '../../services/avisos.eventos';
import { AuthPayload } from '../../middlewares/auth';
import { buscarPorId, emitirBaixa, includePadrao, liberarEquipamento } from './manutencoes.service';

// Reencaminhamento: a terceirizada que atende pede para passar o chamado adiante (só texto), o Administrador confirma e então
// decide o destino — abrir um novo chamado de manutenção ou baixar o equipamento. Cada atendimento continua
// sendo um chamado próprio (MAN-xxxx); o novo aponta para o anterior (`reencaminhadoDeId`) e para a raiz do caso
// (`casoId`). Nada do atendimento anterior (contrato, prestador, orçamento) é copiado para o novo.

// Em quais status do ciclo o atendimento pode pedir para ser reencaminhado: só até antes de iniciar o serviço
const STATUS_QUE_PODEM_PEDIR: StatusManutencao[] = [
  'AGUARDANDO_ORCAMENTO',
  'ORCAMENTO_REGISTRADO',
  'AGUARDANDO_EXECUCAO',
];

type Carregada = Awaited<ReturnType<typeof buscarPorId>>;

const raizDoCaso = (m: { id: string; casoId: string | null }) => m.casoId ?? m.id;

function exigirReencaminhamentoConfirmado(m: Carregada) {
  if (m.status !== 'REENCAMINHAMENTO_SOLICITADO') {
    throw new AppError('Este chamado não tem reencaminhamento solicitado.', 422);
  }
  if (!m.reencaminhamentoConfirmadoEm) {
    throw new AppError('Confirme o reencaminhamento antes de decidir o destino.', 422);
  }
}

// O pedido só vale uma vez: a condição de status vai na própria gravação para que dois cliques simultâneos
// (ou um pedido concorrente com outra ação) não passem os dois.
function exigirGravado(resultado: { count: number }, mensagem: string) {
  if (resultado.count === 0) throw new AppError(mensagem, 409);
}

export async function solicitarReencaminhamento(usuario: AuthPayload, id: string, motivo: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (!STATUS_QUE_PODEM_PEDIR.includes(manutencao.status)) {
    throw new AppError('O reencaminhamento só pode ser solicitado enquanto o chamado está com o atendimento.', 422);
  }
  const atualizada = await prisma.$transaction(async (tx) => {
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: manutencao.status },
      data: {
        status: 'REENCAMINHAMENTO_SOLICITADO',
        motivoReencaminhamento: motivo,
        reencaminhamentoSolicitadoEm: new Date(),
        reencaminhamentoConfirmadoEm: null,
      },
    });
    exigirGravado(gravado, 'O chamado mudou de situação. Atualize a página e tente de novo.');
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'SOLICITAR_REENCAMINHAMENTO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: manutencao.status },
        dadosDepois: { status: 'REENCAMINHAMENTO_SOLICITADO', motivo, perfil: usuario.perfil },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
  await avisos.avisoReencaminhamentoSolicitado(atualizada, motivo);
  return atualizada;
}

export async function confirmarReencaminhamento(usuario: AuthPayload, id: string) {
  const manutencao = await buscarPorId(usuario, id);
  if (manutencao.status !== 'REENCAMINHAMENTO_SOLICITADO') {
    throw new AppError('Este chamado não tem reencaminhamento solicitado.', 422);
  }
  return prisma.$transaction(async (tx) => {
    const gravado = await tx.manutencao.updateMany({
      where: { id, status: 'REENCAMINHAMENTO_SOLICITADO', reencaminhamentoConfirmadoEm: null },
      data: { reencaminhamentoConfirmadoEm: new Date() },
    });
    exigirGravado(gravado, 'O reencaminhamento já foi confirmado.');
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONFIRMAR_REENCAMINHAMENTO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosDepois: { status: 'REENCAMINHAMENTO_SOLICITADO' },
      },
      tx,
    );
    return tx.manutencao.findUniqueOrThrow({ where: { id }, include: includePadrao });
  });
}

export type DadosNovoChamado = {
  tipo: TipoManutencao;
  equipamentoId?: string;
  titulo?: string;
  descricaoProblema?: string;
  localAfetado?: string;
  categoriaCivilId?: string;
};

type Cliente = Prisma.TransactionClient;

// Define o equipamento do novo chamado (ou nenhum, no civil) e libera o do atendimento anterior quando ele
// deixa de ser objeto da manutenção. Devolve o equipamentoId a gravar.
async function resolverEquipamento(tx: Cliente, origem: Carregada, dados: DadosNovoChamado, usuarioId: string) {
  let destinoId: string | null = null;
  if (dados.tipo === 'EQUIPAMENTO') {
    destinoId = dados.equipamentoId ?? origem.equipamentoId;
    if (!destinoId) throw new AppError('Informe o equipamento do novo chamado.', 422);
    const equipamento = await tx.equipamento.findUnique({
      where: { id: destinoId },
      select: {
        id: true,
        status: true,
        unidadeId: true,
        tipoEquipamento: { select: { nome: true, permitePreventiva: true, permiteCorretiva: true } },
      },
    });
    if (!equipamento) throw new AppError('Equipamento não encontrado.', 404);
    if (equipamento.unidadeId !== origem.unidadeId) {
      throw new AppError('O equipamento precisa ser da mesma unidade do chamado.', 422);
    }
    const tipo = equipamento.tipoEquipamento;
    if (tipo && !tipo.permitePreventiva && !tipo.permiteCorretiva) {
      throw new AppError(`O tipo de item "${tipo.nome}" não permite manutenção.`, 422);
    }
    // Continua bloqueado se for o mesmo equipamento do atendimento anterior; um outro precisa estar livre
    const mesmoEquipamento = destinoId === origem.equipamentoId;
    if (!mesmoEquipamento && equipamento.status !== 'ATIVO') {
      throw new AppError(`O equipamento está com status ${equipamento.status} e não pode receber manutenção.`, 422);
    }
  }
  if (origem.equipamentoId && origem.equipamentoId !== destinoId) {
    await liberarEquipamento(tx, origem.equipamentoId, origem.unidadeId, usuarioId, 'Chamado reencaminhado sem manutenção deste equipamento');
  }
  return destinoId;
}

function camposCivis(origem: Carregada, dados: DadosNovoChamado) {
  const localAfetado = (dados.localAfetado ?? origem.localAfetado)?.trim();
  const categoriaCivilId = dados.categoriaCivilId ?? origem.categoriaCivilId;
  if (!localAfetado) throw new AppError('Informe o local afetado do novo chamado.', 422);
  if (!categoriaCivilId) throw new AppError('Informe o tipo de problema do novo chamado.', 422);
  return { localAfetado, categoriaCivilId, fotos: origem.fotos };
}

// O atendimento atual fecha (CONCLUIDA) e nasce um novo chamado, sem contrato, prestador nem orçamento, na fila
// de triagem do Administrador (PENDENTE_APROVACAO), onde ele escolhe o item de contrato como em qualquer chamado.
export async function reencaminharParaManutencao(usuario: AuthPayload, id: string, dados: DadosNovoChamado) {
  const origem = await buscarPorId(usuario, id);
  exigirReencaminhamentoConfirmado(origem);
  const resultado = await prisma.$transaction(async (tx) => {
    const fechado = await tx.manutencao.updateMany({
      where: { id, status: 'REENCAMINHAMENTO_SOLICITADO', reencaminhamentoConfirmadoEm: { not: null } },
      data: { status: 'CONCLUIDA', dataConclusao: new Date() },
    });
    exigirGravado(fechado, 'Este reencaminhamento já foi decidido.');
    const equipamentoId = await resolverEquipamento(tx, origem, dados, usuario.sub);
    const novo = await tx.manutencao.create({
      data: {
        tipo: dados.tipo,
        equipamentoId,
        unidadeId: origem.unidadeId,
        solicitanteId: origem.solicitanteId,
        titulo: dados.titulo?.trim() || origem.titulo,
        descricaoProblema: dados.descricaoProblema?.trim() || origem.descricaoProblema,
        reencaminhadoDeId: id,
        casoId: raizDoCaso(origem),
        ...(dados.tipo === 'CIVIL' ? camposCivis(origem, dados) : {}),
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'REENCAMINHAR_MANUTENCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: 'REENCAMINHAMENTO_SOLICITADO' },
        dadosDepois: { status: 'CONCLUIDA', novaManutencaoId: novo.id, numero: novo.numero, tipo: novo.tipo },
      },
      tx,
    );
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ABRIR_MANUTENCAO_REENCAMINHADA',
        entidade: 'manutencao',
        entidadeId: novo.id,
        dadosDepois: { origemId: id, casoId: raizDoCaso(origem), tipo: novo.tipo },
      },
      tx,
    );
    return novo;
  });
  await avisos.avisoReencaminhadoParaManutencao(origem, resultado);
  return resultado;
}

// A Unidade diz que o problema persiste (chamado civil). O atendimento atual fecha e nasce um subchamado na fila da
// triagem, ligado ao anterior e ao caso, sem contrato nem prestador: o triador escolhe o item de contrato de novo.
// O valor informado pelo prestador deixa de ocupar o saldo (a Unidade contestou o serviço).
export async function contestarComSubchamado(usuario: AuthPayload, id: string, motivo: string) {
  const origem = await buscarPorId(usuario, id);
  if (origem.tipo !== 'CIVIL') throw new AppError('A contestação só vale para manutenção civil.', 422);
  if (origem.status !== 'AGUARDANDO_RETORNO') {
    throw new AppError('Só é possível contestar um serviço que aguarda a confirmação da unidade.', 422);
  }
  if (origem.unidadeId !== usuario.unidadeId) {
    throw new AppError('Somente a unidade do chamado pode contestar.', 403);
  }
  const novo = await prisma.$transaction(async (tx) => {
    const fechado = await tx.manutencao.updateMany({
      where: { id, status: 'AGUARDANDO_RETORNO' },
      data: { status: 'CONCLUIDA', dataConclusao: new Date(), confirmadoUnidade: false, contestacaoUnidade: motivo, custoFinal: null },
    });
    exigirGravado(fechado, 'O chamado mudou de situação. Atualize a página e tente de novo.');
    const criado = await tx.manutencao.create({
      data: {
        tipo: 'CIVIL',
        unidadeId: origem.unidadeId,
        solicitanteId: origem.solicitanteId,
        titulo: origem.titulo,
        descricaoProblema: `${origem.descricaoProblema}\n\nA unidade contestou a execução do chamado anterior: ${motivo}`,
        localAfetado: origem.localAfetado,
        categoriaCivilId: origem.categoriaCivilId,
        fotos: origem.fotos,
        setores: { create: origem.setores.map((s) => ({ setorId: s.setor.id })) },
        reencaminhadoDeId: id,
        casoId: raizDoCaso(origem),
        abertoPorContestacao: true,
      },
      include: includePadrao,
    });
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'CONTESTAR_EXECUCAO',
        entidade: 'manutencao',
        entidadeId: id,
        dadosAntes: { status: 'AGUARDANDO_RETORNO' },
        dadosDepois: { status: 'CONCLUIDA', motivo, novaManutencaoId: criado.id, numero: criado.numero },
      },
      tx,
    );
    await registrarAuditoria(
      {
        usuarioId: usuario.sub,
        acao: 'ABRIR_MANUTENCAO_REENCAMINHADA',
        entidade: 'manutencao',
        entidadeId: criado.id,
        dadosDepois: { origemId: id, casoId: raizDoCaso(origem), tipo: 'CIVIL', motivoContestacao: motivo },
      },
      tx,
    );
    return criado;
  });
  await avisos.avisoContestacaoUnidade(origem, novo, origem.unidade.nome);
  return novo;
}

// Baixa pelo reencaminhamento: usa o fluxo de baixa que já existe (laudo, equipamento baixado e substituição
// automática), agora ligada ao caso pela `manutencaoOrigemId` da solicitação gerada.
export async function reencaminharParaBaixa(usuario: AuthPayload, id: string, laudo: string) {
  const origem = await buscarPorId(usuario, id);
  exigirReencaminhamentoConfirmado(origem);
  return emitirBaixa(usuario, id, laudo);
}

export type EtapaDoCaso = {
  id: string;
  numero: number;
  tipo: TipoManutencao;
  titulo: string | null;
  status: StatusManutencao;
  criadoEm: Date;
  dataConclusao: Date | null;
  motivoReencaminhamento: string | null;
  reencaminhadoDeId: string | null;
  atual: boolean;
  // Só os chamados que o usuário pode abrir têm link; os demais aparecem apenas como etapa
  acessivel: boolean;
  prestador: string | null;
  baixa: { id: string; numero: number; status: string } | null;
};

// Linha do tempo do caso: toda a cadeia de atendimentos a partir do chamado aberto. A terceirizada só identifica o
// prestador e abre os chamados do próprio contrato; das demais etapas vê a situação e o motivo do reencaminhamento.
export async function trajetoria(usuario: AuthPayload, id: string): Promise<EtapaDoCaso[]> {
  const atual = await buscarPorId(usuario, id);
  const raiz = raizDoCaso(atual);
  const terceirizada = usuario.perfil === 'TERCEIRIZADA';
  const etapas = await prisma.manutencao.findMany({
    where: {
      OR: [{ id: raiz }, { casoId: raiz }],
      ...(usuario.perfil === 'UNIDADE' ? { unidadeId: usuario.unidadeId ?? '' } : {}),
    },
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      numero: true,
      tipo: true,
      titulo: true,
      status: true,
      abertoPorContestacao: true,
      criadoEm: true,
      dataConclusao: true,
      motivoReencaminhamento: true,
      reencaminhadoDeId: true,
      contrato: { select: { prestadorId: true, prestador: { select: { nome: true } } } },
      solicitacoesGeradas: { select: { id: true, numero: true, status: true }, take: 1 },
    },
  });
  return etapas.map((e) => {
    const doMeuPrestador = terceirizada && !!usuario.prestadorId && e.contrato?.prestadorId === usuario.prestadorId;
    const mostraPrestador = !terceirizada || doMeuPrestador;
    return {
      id: e.id,
      numero: e.numero,
      tipo: e.tipo,
      titulo: e.titulo,
      status: e.status,
      abertoPorContestacao: e.abertoPorContestacao,
      criadoEm: e.criadoEm,
      dataConclusao: e.dataConclusao,
      motivoReencaminhamento: e.motivoReencaminhamento,
      reencaminhadoDeId: e.reencaminhadoDeId,
      atual: e.id === id,
      acessivel: !terceirizada || doMeuPrestador,
      prestador: mostraPrestador ? (e.contrato?.prestador.nome ?? null) : null,
      baixa: terceirizada ? null : (e.solicitacoesGeradas[0] ?? null),
    };
  });
}
