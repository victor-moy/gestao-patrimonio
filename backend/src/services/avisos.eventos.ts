import {
  codigoManutencao,
  codigoSolicitacao,
  criarAvisos,
  idsUsuariosDaUnidade,
  idsUsuariosDoPrestador,
  idsUsuariosPorPerfil,
} from './avisos.service';
import { Perfil } from '@prisma/client';

type SolRef = { id: string; numero: number; unidadeOrigemId: string; unidadeDestinoId?: string | null };
type ManRef = {
  id: string;
  numero: number;
  unidadeId: string;
  titulo?: string | null;
  contrato?: { prestadorId: string; numero?: string; prestador?: { nome: string } } | null;
  equipamento?: { tombamento: string } | null;
};

function refSol(s: SolRef) {
  return codigoSolicitacao(s.numero);
}

function refMan(m: ManRef) {
  return codigoManutencao(m.numero);
}

function hrefSol(id: string) {
  return `/solicitacoes/${id}`;
}

function hrefMan(id: string) {
  return `/manutencoes/${id}`;
}

async function idsSeguros(buscar: () => Promise<string[]>) {
  try {
    return await buscar();
  } catch (err) {
    console.error('Falha ao resolver destinatários de aviso:', err);
    return [];
  }
}

async function paraUnidade(unidadeId: string, dados: Parameters<typeof criarAvisos>[1]) {
  await criarAvisos(await idsSeguros(() => idsUsuariosDaUnidade(unidadeId)), dados);
}

async function paraOperadores(dados: Parameters<typeof criarAvisos>[1]) {
  await criarAvisos(await idsSeguros(() => idsUsuariosPorPerfil(Perfil.OPERADOR)), dados);
}

async function paraPrestador(prestadorId: string | null | undefined, dados: Parameters<typeof criarAvisos>[1]) {
  if (!prestadorId) return;
  await criarAvisos(await idsSeguros(() => idsUsuariosDoPrestador(prestadorId)), dados);
}

export async function avisoSolicitacaoAprovada(s: SolRef) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'SOLICITACAO_APROVADA',
    titulo: 'Solicitação aprovada',
    mensagem: `${refSol(s)} foi aprovada pelo Patrimônio.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoEmprestimoAprovado(s: SolRef, tombamento?: string | null) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'EMPRESTIMO_APROVADO',
    titulo: 'Empréstimo aprovado',
    mensagem: `${refSol(s)}${tombamento ? ` (${tombamento})` : ''}: confirme a saída do equipamento.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoRecolhaAprovada(s: SolRef, tombamento?: string | null) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'RECOLHA_APROVADA',
    titulo: 'Recolha aprovada',
    mensagem: `${refSol(s)}${tombamento ? ` (${tombamento})` : ''}: aguardando a busca pelo Patrimônio.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoSolicitacaoEmAndamento(s: SolRef) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'SOLICITACAO_EM_ANDAMENTO',
    titulo: 'Solicitação em andamento',
    mensagem: `${refSol(s)} avançou — o item já está garantido.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoSolicitacaoNegada(s: SolRef, motivo: string) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'SOLICITACAO_NEGADA',
    titulo: 'Solicitação negada',
    mensagem: `${refSol(s)} foi negada. Motivo: ${motivo}`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoItemProntoEntrega(s: SolRef) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'ITEM_PRONTO_ENTREGA',
    titulo: 'Item pronto para entrega',
    mensagem: `${refSol(s)} foi lançado no Branet. Confirme o recebimento quando o item chegar.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoEmprestimoIniciado(s: SolRef, tombamento?: string | null, origemNome?: string) {
  if (!s.unidadeDestinoId) return;
  await paraUnidade(s.unidadeDestinoId, {
    tipo: 'EMPRESTIMO_INICIADO',
    titulo: 'Empréstimo iniciado',
    mensagem: `${refSol(s)}${tombamento ? ` (${tombamento})` : ''} chegou${origemNome ? ` de ${origemNome}` : ''}.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoRecebimentoConfirmadoAdmin(s: SolRef, unidadeNome?: string) {
  await paraOperadores({
    tipo: 'RECEBIMENTO_CONFIRMADO',
    titulo: 'Recebimento confirmado',
    mensagem: `${refSol(s)}${unidadeNome ? ` (${unidadeNome})` : ''}: aguardando validação do Patrimônio.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoRecolhaConfirmadaAdmin(s: SolRef, unidadeNome?: string) {
  await paraOperadores({
    tipo: 'RECOLHA_CONFIRMADA',
    titulo: 'Recolha confirmada pela unidade',
    mensagem: `${refSol(s)}${unidadeNome ? ` (${unidadeNome})` : ''}: aguardando validação do Patrimônio.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoSolicitacaoExpirada(s: SolRef, unidadeNome: string, slaDias: number) {
  await paraUnidade(s.unidadeOrigemId, {
    tipo: 'SOLICITACAO_EXPIRADA',
    titulo: 'Solicitação encerrada',
    mensagem: `${refSol(s)} foi fechada após ${slaDias} dias sem retorno do Administrador.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
  await paraOperadores({
    tipo: 'SOLICITACAO_EXPIRADA_SLA',
    titulo: 'Solicitação expirada por SLA',
    mensagem: `${refSol(s)} da unidade ${unidadeNome} foi fechada automaticamente após ${slaDias} dias.`,
    href: hrefSol(s.id),
    solicitacaoId: s.id,
  });
}

export async function avisoManutencaoAprovada(m: ManRef, civil: boolean) {
  await paraUnidade(m.unidadeId, {
    tipo: civil ? 'MANUTENCAO_CIVIL_ENCAMINHADA' : 'MANUTENCAO_APROVADA',
    titulo: civil ? 'Chamado civil encaminhado' : 'Manutenção aprovada',
    mensagem: civil
      ? `${refMan(m)} foi encaminhado ao prestador.`
      : `${refMan(m)}${m.equipamento ? ` (${m.equipamento.tombamento})` : ''} foi aprovada.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
  if (m.contrato?.prestadorId) {
    await paraPrestador(m.contrato.prestadorId, {
      tipo: civil ? 'CHAMADO_AGUARDANDO_EXECUCAO' : 'CHAMADO_AGUARDANDO_ORCAMENTO',
      titulo: civil ? 'Novo chamado aguardando execução' : 'Novo chamado aguardando orçamento',
      mensagem: `${refMan(m)} foi encaminhado para você.`,
      href: hrefMan(m.id),
      manutencaoId: m.id,
    });
  }
}

export async function avisoManutencaoProvidencias(m: ManRef, motivo: string) {
  await paraUnidade(m.unidadeId, {
    tipo: 'MANUTENCAO_PROVIDENCIAS',
    titulo: 'Chamado aguardando providências',
    mensagem: `${refMan(m)} ainda não foi encaminhado. Motivo: ${motivo}`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoManutencaoNegada(m: ManRef, motivo: string) {
  await paraUnidade(m.unidadeId, {
    tipo: 'MANUTENCAO_NEGADA',
    titulo: 'Manutenção negada',
    mensagem: `${refMan(m)} foi negada. Motivo: ${motivo}`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoOrcamentoRegistrado(m: ManRef) {
  await paraOperadores({
    tipo: 'ORCAMENTO_REGISTRADO',
    titulo: 'Orçamento registrado',
    mensagem: `${refMan(m)}: a terceirizada registrou o orçamento. Falta sua decisão.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoOrcamentoDecidido(m: ManRef, aprovado: boolean) {
  if (!m.contrato?.prestadorId) return;
  await paraPrestador(m.contrato.prestadorId, {
    tipo: aprovado ? 'ORCAMENTO_APROVADO' : 'ORCAMENTO_REJEITADO',
    titulo: aprovado ? 'Orçamento aprovado' : 'Orçamento rejeitado',
    mensagem: aprovado
      ? `${refMan(m)}: orçamento aprovado — inicie a execução.`
      : `${refMan(m)}: orçamento rejeitado; o chamado foi baixado.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
  if (aprovado) {
    await paraUnidade(m.unidadeId, {
      tipo: 'ORCAMENTO_APROVADO_UNIDADE',
      titulo: 'Manutenção em execução',
      mensagem: `${refMan(m)}: o orçamento foi aprovado e a execução começou.`,
      href: hrefMan(m.id),
      manutencaoId: m.id,
    });
  }
}

export async function avisoReparoConcluido(m: ManRef) {
  await paraUnidade(m.unidadeId, {
    tipo: 'REPARO_CONCLUIDO',
    titulo: 'Reparo concluído',
    mensagem: `${refMan(m)}: confirme o retorno ou a resolução do problema.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
  await paraOperadores({
    tipo: 'REPARO_CONCLUIDO_ADMIN',
    titulo: 'Reparo concluído pelo prestador',
    mensagem: `${refMan(m)}: o prestador concluiu o reparo.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoRetornoConfirmadoUnidade(m: ManRef, unidadeNome?: string) {
  await paraOperadores({
    tipo: 'RETORNO_CONFIRMADO_UNIDADE',
    titulo: 'Unidade confirmou o retorno',
    mensagem: `${refMan(m)}${unidadeNome ? ` (${unidadeNome})` : ''}: falta a confirmação do Patrimônio.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoMedicaoAguardando(m: ManRef, origem: string) {
  await paraOperadores({
    tipo: 'MEDICAO_AGUARDANDO',
    titulo: 'Chamado aguardando medição',
    mensagem: `${refMan(m)}: ${origem}. Falta autorizar a medição.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoAjustesSolicitados(m: ManRef, motivo: string) {
  if (!m.contrato?.prestadorId) return;
  await paraPrestador(m.contrato.prestadorId, {
    tipo: 'AJUSTES_SOLICITADOS',
    titulo: 'Ajustes solicitados no chamado',
    mensagem: `${refMan(m)}: o Administrador pediu ajustes. Motivo: ${motivo}`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
}

export async function avisoContestacaoUnidade(m: ManRef, unidadeNome?: string) {
  await paraOperadores({
    tipo: 'EXECUCAO_CONTESTADA',
    titulo: 'Execução contestada pela unidade',
    mensagem: `${refMan(m)}${unidadeNome ? ` (${unidadeNome})` : ''}: o chamado voltou ao prestador.`,
    href: hrefMan(m.id),
    manutencaoId: m.id,
  });
  if (m.contrato?.prestadorId) {
    await paraPrestador(m.contrato.prestadorId, {
      tipo: 'EXECUCAO_CONTESTADA_PRESTADOR',
      titulo: 'Execução contestada',
      mensagem: `${refMan(m)}: a unidade contestou a execução. O chamado voltou para você.`,
      href: hrefMan(m.id),
      manutencaoId: m.id,
    });
  }
}

export async function avisoEquipamentoBaixado(m: ManRef, tombamento: string, solicitacaoSubId?: string) {
  await paraUnidade(m.unidadeId, {
    tipo: 'EQUIPAMENTO_BAIXADO',
    titulo: 'Equipamento baixado',
    mensagem: `O equipamento ${tombamento} foi baixado. Uma substituição foi aberta automaticamente.`,
    href: solicitacaoSubId ? hrefSol(solicitacaoSubId) : hrefMan(m.id),
    manutencaoId: m.id,
    solicitacaoId: solicitacaoSubId,
  });
  await paraOperadores({
    tipo: 'SUBSTITUICAO_AUTOMATICA',
    titulo: 'Substituição automática aberta',
    mensagem: `${tombamento} baixado por manutenção — substituição gerada automaticamente.`,
    href: solicitacaoSubId ? hrefSol(solicitacaoSubId) : hrefMan(m.id),
    manutencaoId: m.id,
    solicitacaoId: solicitacaoSubId,
  });
}
