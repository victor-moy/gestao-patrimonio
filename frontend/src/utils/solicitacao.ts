import type { EventoSolicitacao, Solicitacao } from '../types';
import { ROTULO_STATUS_SOLICITACAO } from './format';

// Ampliação/Substituição seguem o fluxo de aquisição via ata; os demais
// tipos operam sobre um equipamento já existente no inventário da unidade.
export const TIPOS_COM_ATA = ['AMPLIACAO', 'SUBSTITUICAO'];

// Aguardando Disponibilidade com estoque já disponível vira um badge próprio
// (verde, "Disponível para Reserva") em vez do status + um badge separado.
// Recolha ganha rótulos próprios: Pendente Aprovação de Recolha, e depois
// Aguardando Recolha (Patrimônio) ou (Branet) — escolhido pelo Gestor de
// uma vez, na aprovação, e não muda depois (feedback do cliente 26/08 e 27/08).
export function statusExibido(s: Solicitacao) {
  if (s.status === 'AGUARDANDO_DISPONIBILIDADE' && s.disponivelParaReserva) {
    return { valor: 'DISPONIVEL_PARA_RESERVA', texto: 'Disponível para Reserva' };
  }
  if (s.tipo === 'RECOLHA') {
    if (s.status === 'PENDENTE_APROVACAO') {
      return { valor: s.status, texto: 'Pendente Aprovação de Recolha' };
    }
    if (s.status === 'AGUARDANDO_ENTREGA') {
      return s.pedidoEntregaRegistradoEm
        ? { valor: 'AGUARDANDO_RECOLHA_BRANET', texto: 'Aguardando Recolha (Branet)' }
        : { valor: 'AGUARDANDO_RECOLHA_PATRIMONIO', texto: 'Aguardando Recolha (Patrimônio)' };
    }
  }
  return { valor: s.status as string, texto: ROTULO_STATUS_SOLICITACAO[s.status] };
}


export function nomeItem(s: Solicitacao) {
  return s.equipamento
    ? s.equipamento.tipoEquipamento?.nome || s.equipamento.descricao
    : (s.tipoEquipamento?.nome ?? 'Item');
}

const ROTULO_EVENTO: Record<string, string> = {
  ABRIR_SOLICITACAO: 'Solicitação aberta',
  APROVAR_SOLICITACAO: 'Solicitação aprovada',
  APROVAR_EMPRESTIMO: 'Solicitação aprovada',
  APROVAR_RECOLHA: 'Solicitação aprovada',
  APROVAR_COM_ATA: 'Aprovada e vinculada à ata',
  RESERVAR_DO_ESTOQUE: 'Item reservado do estoque',
  NEGAR_SOLICITACAO: 'Solicitação negada',
  MARCAR_LANCADO_BRANET: 'Pedido lançado no Branet',
  AJUSTAR_TOMBAMENTO_SOLICITACAO: 'Tombamento ajustado',
  VALIDAR_CONCLUSAO_SOLICITACAO: 'Solicitação concluída',
  REGISTRAR_EMPRESTIMO: 'Empréstimo registrado',
  CONFIRMAR_SAIDA_EMPRESTIMO: 'Saída do item confirmada',
  CONCLUIR_EMPRESTIMO: 'Empréstimo encerrado',
  CONFIRMAR_RECOLHA: 'Recolha confirmada',
};

// Texto do evento no histórico; ações desconhecidas viram um texto legível
// em vez de aparecer o código bruto.
export function rotuloEvento(evento: EventoSolicitacao) {
  if (evento.acao === 'CONFIRMAR_RECEBIMENTO_ITEM') {
    return evento.recebimentoOk === false
      ? 'Recebimento confirmado com divergência'
      : 'Recebimento confirmado';
  }
  const conhecido = ROTULO_EVENTO[evento.acao];
  if (conhecido) return conhecido;
  const texto = evento.acao.toLowerCase().replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
