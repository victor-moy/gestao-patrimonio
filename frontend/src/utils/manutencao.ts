import type { EventoManutencao } from '../types';

const ROTULO_EVENTO: Record<string, string> = {
  ABRIR_MANUTENCAO: 'Manutenção solicitada',
  ABRIR_MANUTENCAO_CIVIL: 'Chamado de manutenção civil aberto',
  AGUARDAR_PROVIDENCIAS: 'Chamado aguardando providências',
  REJEITAR_ORCAMENTO: 'Orçamento recusado',
  INCLUIR_LINHA_RELATORIO: 'Serviço ou material incluído',
  REMOVER_LINHA_RELATORIO: 'Serviço ou material removido',
  REVISAR_ORCAMENTO: 'Revisão do orçamento solicitada',
  CONTESTAR_EXECUCAO: 'Execução contestada pela unidade',
  AUTORIZAR_MEDICAO: 'Medição autorizada',
  APROVAR_MANUTENCAO: 'Manutenção aprovada',
  NEGAR_MANUTENCAO: 'Manutenção negada',
  TROCAR_ITEM_CONTRATO: 'Item de contrato alterado',
  REGISTRAR_ORCAMENTO: 'Orçamento registrado',
  APROVAR_ORCAMENTO: 'Orçamento aprovado',
  EMITIR_LAUDO_BAIXA: 'Laudo de baixa emitido',
  REGISTRAR_RETORNO_MANUTENCAO: 'Retorno do equipamento registrado',
  INICIAR_EXECUCAO: 'Execução iniciada pelo prestador',
  SOLICITAR_AJUSTES: 'Ajustes solicitados pelo administrador',
  CONCLUIR_MANUTENCAO: 'Manutenção concluída',
  SOLICITAR_REENCAMINHAMENTO: 'Reencaminhamento solicitado',
  CONFIRMAR_REENCAMINHAMENTO: 'Reencaminhamento confirmado pelo administrador',
  REENCAMINHAR_MANUTENCAO: 'Reencaminhado em um novo chamado',
  ABRIR_MANUTENCAO_REENCAMINHADA: 'Chamado aberto por reencaminhamento',
};

// Texto do evento no histórico; no civil, retorno/confirmação usam rótulos do fluxo de resolução.
export function rotuloEventoManutencao(evento: EventoManutencao, tipo?: 'EQUIPAMENTO' | 'CIVIL') {
  const civil = tipo === 'CIVIL';
  if (evento.acao === 'CONFIRMAR_RETORNO_MANUTENCAO') {
    if (civil) return 'Resolução confirmada pela unidade';
    return evento.perfil === 'UNIDADE'
      ? 'Retorno confirmado pela unidade'
      : 'Retorno confirmado pelo administrador';
  }
  if (civil && evento.acao === 'REGISTRAR_RETORNO_MANUTENCAO') {
    return 'Finalização do reparo registrada';
  }
  const conhecido = ROTULO_EVENTO[evento.acao];
  if (conhecido) return conhecido;
  const texto = evento.acao.toLowerCase().replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Como a manutenção é chamada nas listas e no detalhe: o título dado a ela ou, sem título, o nome do equipamento. */
type ComEquipamento = {
  localAfetado?: string | null;
  equipamento: { descricao: string; tipoEquipamento?: { nome: string } } | null;
};

export function tituloManutencao(m: ComEquipamento & { titulo?: string | null }) {
  return m.titulo?.trim() || nomeEquipamento(m);
}

/** Nome do equipamento; no chamado civil (sem equipamento) vale o local afetado. */
export function nomeEquipamento(m: ComEquipamento) {
  if (!m.equipamento) return m.localAfetado ?? 'Manutenção civil';
  return m.equipamento.tipoEquipamento?.nome ?? m.equipamento.descricao;
}

export const ROTULO_CATEGORIA_CIVIL: Record<string, string> = {
  HIDRAULICA: 'Hidráulica',
  ELETRICA: 'Elétrica',
  INFILTRACAO: 'Infiltração',
  ALVENARIA_PINTURA: 'Alvenaria e pintura',
  COBERTURA: 'Cobertura',
  ESQUADRIAS_VIDROS: 'Esquadrias e vidros',
  CLIMATIZACAO_CIVIL: 'Climatização',
  OUTROS: 'Outros',
};
