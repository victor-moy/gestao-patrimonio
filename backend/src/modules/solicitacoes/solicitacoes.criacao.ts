// Criação de solicitações (UC10/UC13/UC16...) — todos os tipos.

import { OrigemRecurso, TipoSolicitacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { AuthPayload } from '../../middlewares/auth';
import { tentarReservarDoEstoque } from './solicitacoes.comum';

export interface DadosCriacao {
  tipo: TipoSolicitacao;
  // Obrigatória pra todos os tipos, exceto Substituição — que carrega uma
  // justificativa por item (feedback do cliente 25/08: cada equipamento
  // trocado pode ter um motivo diferente de defeito).
  justificativa?: string;
  unidadeDestinoId?: string;
  tipoEquipamentoId?: string;
  quantidade?: number;
  // Ampliação/Substituição/Recolha/Empréstimo/Cessão de Uso: seleção de
  // múltiplos itens numa única tela — vira uma Solicitacao por item
  // internamente (feedback do cliente 17/08, 25/08 e 26/08). Substituição
  // usa `equipamentoId` e `justificativa` por item; Recolha e Empréstimo
  // usam só `equipamentoId` (quem abre escolhe os equipamentos existentes,
  // sem tipo/quantidade); Ampliação usa `tipoEquipamentoId`/`quantidade`;
  // Cessão de Uso usa `tipoEquipamentoId` (reserva 1 unidade do estoque de
  // galpão por item — sempre quantidade 1, pra ceder mais de uma unidade
  // do mesmo tipo adiciona outro item) mais `numerosPatrimonio` com um
  // único nº de patrimônio, já informado na criação.
  itens?: Array<{
    equipamentoId?: string;
    tipoEquipamentoId?: string;
    quantidade?: number;
    justificativa?: string;
    numerosPatrimonio?: string[];
  }>;
  origemRecurso?: OrigemRecurso;
  entidadeExternaNome?: string;
  // Empréstimo: data final prevista do empréstimo, obrigatória na criação.
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

// UC10/UC13/UC16 + recolha — 5 tipos: Substituição, Ampliação, Cessão de
// Uso (externa), Empréstimo (interno, com ou sem retorno) e Recolha.
// Retorna sempre os ids das Solicitacao criadas (array) — Ampliação e
// Substituição podem gerar mais de uma (feedback do cliente 17/08 e 25/08:
// seleção de múltiplos itens numa única tela, uma Solicitacao por item
// internamente).
export async function criar(usuario: AuthPayload, dados: DadosCriacao): Promise<string[]> {
  // CESSAO_USO — exclusiva do Gestor de Patrimônio (envolve entidade externa
  // à secretaria). Não sai do inventário de uma unidade específica: reserva
  // do estoque de galpão por tipo, sempre 1 unidade por item (cada item já
  // tem seu próprio nº de patrimônio — pra ceder mais de uma unidade do
  // mesmo tipo, adiciona outro item), igual Ampliação/Substituição mas sem
  // a etapa de Ata — se não tiver saldo, falha na hora (não fica aguardando
  // disponibilidade). Vira uma Solicitacao por item, já RESERVADO; o Gestor
  // só marca lançado no Branet depois pra concluir, sem gerar tombamento
  // novo (o destino é externo, não rastreado no inventário).
  if (dados.tipo === 'CESSAO_USO') {
    if (usuario.perfil !== 'GESTOR_PATRIMONIO') {
      throw new AppError('Somente o Gestor de Patrimônio pode abrir uma Cessão de Uso.', 403);
    }
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um item para a cessão.', 422);
    }
    if (dados.itens.some((item) => !item.tipoEquipamentoId)) {
      throw new AppError('Informe o tipo de equipamento de cada item.', 422);
    }
    if (
      dados.itens.some(
        (item) => !item.numerosPatrimonio || item.numerosPatrimonio.length !== 1 || !item.numerosPatrimonio[0]?.trim(),
      )
    ) {
      throw new AppError('Informe o nº de patrimônio de cada item.', 422);
    }
    if (!dados.justificativa?.trim()) {
      throw new AppError('Informe a justificativa.', 422);
    }
    if (!dados.entidadeExternaNome?.trim()) {
      throw new AppError('Informe o nome da entidade externa que receberá o equipamento.', 422);
    }
    const entidadeExterna = dados.entidadeExternaNome.trim();
    const justificativaCessao = dados.justificativa;
    const itensCessao = dados.itens;
    const criadasCessao = await prisma.$transaction(async (tx) => {
      const criadas = [];
      for (let i = 0; i < itensCessao.length; i++) {
        const item = itensCessao[i];
        const pool = await tentarReservarDoEstoque(tx, item.tipoEquipamentoId!, 1);
        if (!pool) {
          throw new AppError(`Estoque insuficiente para o item ${i + 1}.`, 422);
        }
        const criada = await tx.solicitacao.create({
          data: {
            tipo: 'CESSAO_USO',
            status: 'RESERVADO',
            unidadeOrigemId: pool.unidadeId,
            tipoEquipamentoId: item.tipoEquipamentoId!,
            quantidade: 1,
            numerosPatrimonio: item.numerosPatrimonio!.map((n) => n.trim()),
            entidadeExternaNome: entidadeExterna,
            justificativa: justificativaCessao,
            criadoPorId: usuario.sub,
          },
        });
        criadas.push(criada);
      }
      return criadas;
    });
    return criadasCessao.map((s) => s.id);
  }

  if (!usuario.unidadeId) {
    throw new AppError('Usuário não está vinculado a uma unidade.', 403);
  }
  const unidadeOrigemId = usuario.unidadeId;

  if (dados.tipo === 'AMPLIACAO') {
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um item para a ampliação.', 422);
    }
    if (dados.itens.some((item) => !item.tipoEquipamentoId || !item.quantidade)) {
      throw new AppError('Informe o tipo de equipamento e a quantidade de cada item.', 422);
    }
    if (!dados.justificativa?.trim()) {
      throw new AppError('Informe a justificativa.', 422);
    }
    const justificativaAmpliacao = dados.justificativa;
    const criadas = await prisma.$transaction(
      dados.itens.map((item) =>
        prisma.solicitacao.create({
          data: {
            tipo: 'AMPLIACAO',
            unidadeOrigemId,
            tipoEquipamentoId: item.tipoEquipamentoId!,
            quantidade: item.quantidade!,
            justificativa: justificativaAmpliacao,
            origemRecurso: dados.origemRecurso ?? 'REGULAR',
            criadoPorId: usuario.sub,
          },
        }),
      ),
    );
    return criadas.map((s) => s.id);
  }

  if (dados.tipo === 'SUBSTITUICAO') {
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um equipamento para substituição.', 422);
    }
    if (dados.itens.some((item) => !item.equipamentoId)) {
      throw new AppError('Informe o equipamento a ser substituído em cada item.', 422);
    }
    if (dados.itens.some((item) => !item.justificativa?.trim())) {
      throw new AppError('Informe a justificativa de cada equipamento a substituir.', 422);
    }
    if (dados.itens.some((item) => !item.tipoEquipamentoId || !item.quantidade)) {
      throw new AppError('Informe o item de reposição e a quantidade de cada equipamento.', 422);
    }
    const idsEquipamentos = dados.itens.map((item) => item.equipamentoId!);
    if (new Set(idsEquipamentos).size !== idsEquipamentos.length) {
      throw new AppError('Um mesmo equipamento não pode aparecer duas vezes na mesma solicitação.', 422);
    }
    // Aceita equipamento ATIVO (pedido manual) ou já BAIXADO (RN07 — automático)
    const equipamentosValidados = await Promise.all(
      idsEquipamentos.map((id) => buscarEquipamentoDaUnidade(id, unidadeOrigemId)),
    );
    for (const equipamento of equipamentosValidados) {
      if (!['ATIVO', 'BAIXADO'].includes(equipamento.status)) {
        throw new AppError(
          `O equipamento ${equipamento.tombamento} está com status ${equipamento.status} e não pode ser substituído até o encerramento do ciclo atual.`,
          422,
        );
      }
    }
    const criadas = await prisma.$transaction(
      dados.itens.map((item, i) =>
        prisma.solicitacao.create({
          data: {
            tipo: 'SUBSTITUICAO',
            unidadeOrigemId,
            equipamentoId: equipamentosValidados[i].id,
            tipoEquipamentoId: item.tipoEquipamentoId!,
            quantidade: item.quantidade!,
            justificativa: item.justificativa!.trim(),
            origemRecurso: dados.origemRecurso ?? 'REGULAR',
            criadoPorId: usuario.sub,
          },
        }),
      ),
    );
    return criadas.map((s) => s.id);
  }

  // RECOLHA — a unidade escolhe os equipamentos existentes a recolher (sem
  // destino): o galpão fica a critério do Gestor de Patrimônio, definido só
  // na aprovação — centraliza essa decisão em vez da unidade escolher
  // (feedback do cliente 26/08).
  if (dados.tipo === 'RECOLHA') {
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um equipamento para recolha.', 422);
    }
    if (dados.itens.some((item) => !item.equipamentoId)) {
      throw new AppError('Informe o equipamento em cada item.', 422);
    }
    if (!dados.justificativa?.trim()) {
      throw new AppError('Informe a justificativa.', 422);
    }
    const justificativaRecolha = dados.justificativa;
    const idsEquipamentosRecolha = dados.itens.map((item) => item.equipamentoId!);
    if (new Set(idsEquipamentosRecolha).size !== idsEquipamentosRecolha.length) {
      throw new AppError('Um mesmo equipamento não pode aparecer duas vezes na mesma solicitação.', 422);
    }
    const equipamentosRecolha = await Promise.all(
      idsEquipamentosRecolha.map((id) => buscarEquipamentoDaUnidade(id, unidadeOrigemId)),
    );
    for (const equipamento of equipamentosRecolha) {
      if (equipamento.status !== 'ATIVO') {
        throw new AppError(
          `O equipamento ${equipamento.tombamento} está com status ${equipamento.status} e não pode ser recolhido até o encerramento do ciclo atual.`,
          422,
        );
      }
    }
    const criadasRecolha = await prisma.$transaction(
      equipamentosRecolha.map((equipamento) =>
        prisma.solicitacao.create({
          data: {
            tipo: 'RECOLHA',
            unidadeOrigemId,
            equipamentoId: equipamento.id,
            justificativa: justificativaRecolha,
            criadoPorId: usuario.sub,
          },
        }),
      ),
    );
    return criadasRecolha.map((s) => s.id);
  }

  // EMPRESTIMO — a unidade de origem escolhe um ou mais equipamentos
  // próprios e a unidade de destino (mesmo padrão de lista repetível da
  // Recolha); vira uma Solicitacao por item, todas passam por aprovação do
  // Gestor e só movimentam o equipamento quando a origem confirma a saída
  // (RF25/RN06 — tombamento permanece na origem até a devolução).
  if (dados.tipo === 'EMPRESTIMO') {
    if (!dados.unidadeDestinoId) throw new AppError('Informe a unidade de destino do empréstimo.', 422);
    if (dados.unidadeDestinoId === unidadeOrigemId) {
      throw new AppError('A unidade de destino deve ser diferente da unidade de origem.', 422);
    }
    if (!dados.itens || dados.itens.length === 0) {
      throw new AppError('Selecione ao menos um equipamento para o empréstimo.', 422);
    }
    if (dados.itens.some((item) => !item.equipamentoId)) {
      throw new AppError('Informe o equipamento em cada item.', 422);
    }
    if (!dados.justificativa?.trim()) {
      throw new AppError('Informe a justificativa.', 422);
    }
    if (!dados.dataRetornoPrevista) {
      throw new AppError('Informe a data final do empréstimo.', 422);
    }
    const justificativaEmprestimo = dados.justificativa;
    const dataRetornoPrevista = dados.dataRetornoPrevista;
    const idsEquipamentosEmprestimo = dados.itens.map((item) => item.equipamentoId!);
    if (new Set(idsEquipamentosEmprestimo).size !== idsEquipamentosEmprestimo.length) {
      throw new AppError('Um mesmo equipamento não pode aparecer duas vezes na mesma solicitação.', 422);
    }
    const equipamentosEmprestimo = await Promise.all(
      idsEquipamentosEmprestimo.map((id) => buscarEquipamentoDaUnidade(id, unidadeOrigemId)),
    );
    for (const equipamento of equipamentosEmprestimo) {
      // RN02/FA07 — equipamento em manutenção não pode ser emprestado
      if (equipamento.status !== 'ATIVO') {
        throw new AppError(
          `O equipamento ${equipamento.tombamento} está com status ${equipamento.status} e não pode ser movimentado até o encerramento do ciclo atual.`,
          422,
        );
      }
    }
    const criadasEmprestimo = await prisma.$transaction(
      equipamentosEmprestimo.map((equipamento) =>
        prisma.solicitacao.create({
          data: {
            tipo: 'EMPRESTIMO',
            unidadeOrigemId,
            unidadeDestinoId: dados.unidadeDestinoId,
            equipamentoId: equipamento.id,
            justificativa: justificativaEmprestimo,
            dataRetornoPrevista,
            criadoPorId: usuario.sub,
          },
        }),
      ),
    );
    await registrarAuditoria({
      usuarioId: usuario.sub,
      acao: 'REGISTRAR_EMPRESTIMO',
      entidade: 'solicitacao',
      dadosDepois: { equipamentos: idsEquipamentosEmprestimo, destino: dados.unidadeDestinoId },
    });
    return criadasEmprestimo.map((s) => s.id);
  }

  throw new AppError('Tipo de solicitação inválido.', 422);
}
