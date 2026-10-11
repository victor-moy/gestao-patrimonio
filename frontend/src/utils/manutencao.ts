import type { EventoManutencao } from '../types';

const ROTULO_EVENTO: Record<string, string> = {
  ABRIR_MANUTENCAO: 'Manutenção solicitada',
  APROVAR_MANUTENCAO: 'Manutenção aprovada',
  NEGAR_MANUTENCAO: 'Manutenção negada',
  REGISTRAR_ORCAMENTO: 'Orçamento registrado',
  APROVAR_ORCAMENTO: 'Orçamento aprovado',
  EMITIR_LAUDO_BAIXA: 'Laudo de baixa emitido',
  REGISTRAR_RETORNO_MANUTENCAO: 'Retorno do equipamento registrado',
  CONCLUIR_MANUTENCAO: 'Manutenção concluída',
};

// Texto do evento no histórico; ações desconhecidas viram um texto legível.
export function rotuloEventoManutencao(evento: EventoManutencao) {
  if (evento.acao === 'CONFIRMAR_RETORNO_MANUTENCAO') {
    return evento.perfil === 'UNIDADE'
      ? 'Retorno confirmado pela unidade'
      : 'Retorno confirmado pelo gestor';
  }
  const conhecido = ROTULO_EVENTO[evento.acao];
  if (conhecido) return conhecido;
  const texto = evento.acao.toLowerCase().replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function nomeEquipamento(m: { equipamento: { descricao: string; tipoEquipamento?: { nome: string } } }) {
  return m.equipamento.tipoEquipamento?.nome ?? m.equipamento.descricao;
}
