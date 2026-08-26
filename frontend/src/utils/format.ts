export function formatarData(data: string | Date | null | undefined) {
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR');
}

export function formatarDataHora(data: string | Date | null | undefined) {
  if (!data) return '—';
  return new Date(data).toLocaleString('pt-BR');
}

export function formatarMoeda(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarMoedaCompacta(valor: number) {
  if (valor >= 1000) return `R$ ${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return formatarMoeda(valor);
}

// Converte texto em CAIXA ALTA para "Primeira Letra De Cada Palavra Maiúscula"
export function capitalizarPalavras(texto: string) {
  return texto
    .toLowerCase()
    .split(' ')
    .map((palavra) => (palavra ? palavra.charAt(0).toUpperCase() + palavra.slice(1) : palavra))
    .join(' ');
}

export const ROTULO_ESTADO: Record<string, string> = {
  OTIMO: 'Ótimo',
  BOM: 'Bom',
  REGULAR: 'Regular',
  RUIM: 'Ruim',
  PESSIMO: 'Péssimo',
};

export const ROTULO_STATUS_EQUIPAMENTO: Record<string, string> = {
  ATIVO: 'Ativo',
  EM_MANUTENCAO: 'Em Manutenção',
  EMPRESTADO: 'Emprestado',
  BAIXADO: 'Baixado',
  CEDIDO: 'Cedido (externo)',
};

export const ROTULO_MOTIVO_BAIXA: Record<string, string> = {
  LEILAO: 'Leilão',
  EXTRAVIO: 'Extravio',
  ROUBO: 'Roubo',
  SUBSTITUICAO: 'Substituição',
  OUTRO: 'Outro',
};

export const ROTULO_TIPO_UNIDADE: Record<string, string> = {
  UBSF: 'UBSF',
  UPA: 'UPA',
  PA: 'PA',
  FARMACIA: 'Farmácia',
  SERVICO_ESPECIAL: 'Serviço Especial',
  SERVICO_VIGILANCIA: 'Serviço de Vigilância',
  UNIDADE_ADMINISTRATIVA: 'Unidade Administrativa',
  GALPAO: 'Galpão',
  OUTRO: 'Outro',
};

export const ROTULO_STATUS_MANUTENCAO: Record<string, string> = {
  PENDENTE_APROVACAO: 'Pendente Aprovação',
  NEGADA: 'Negada',
  AGUARDANDO_ORCAMENTO: 'Aguardando Orçamento',
  ORCAMENTO_REGISTRADO: 'Orçamento Registrado',
  EM_EXECUCAO: 'Em Andamento',
  AGUARDANDO_RETORNO: 'Aguardando Retorno',
  CONCLUIDA: 'Concluída',
  BAIXADO: 'Baixado',
};

// APROVADA, APROVADA_AGUARDANDO_ATA e CANCELADA ficaram no enum do banco só
// por compatibilidade (evitar migration destrutiva) — nenhum fluxo atual
// atribui esses status a uma solicitação, então saíram daqui pra não aparecer
// como opção morta no filtro (feedback 20/08).
export const ROTULO_STATUS_SOLICITACAO: Record<string, string> = {
  PENDENTE_APROVACAO: 'Pendente Aprovação',
  NEGADA: 'Negada',
  AGUARDANDO_SAIDA: 'Aguardando Saída',
  AGUARDANDO_RECEBIMENTO: 'Aguardando Recebimento',
  AGUARDANDO_RETORNO: 'Aguardando Retorno',
  AGUARDANDO_ENTREGA: 'Aguardando Entrega',
  CONCLUIDA: 'Concluída',
  EXPIRADA: 'Expirada (SLA)',
  RESERVADO: 'Reservado',
  AGUARDANDO_DISPONIBILIDADE: 'Aguardando Disponibilidade',
  AGUARDANDO_VALIDACAO: 'Aguardando Validação',
};

export const ROTULO_TIPO_SOLICITACAO: Record<string, string> = {
  SUBSTITUICAO: 'Substituição',
  AMPLIACAO: 'Ampliação',
  CESSAO_USO: 'Cessão de Uso',
  EMPRESTIMO: 'Empréstimo',
  RECOLHA: 'Recolha',
};

export const ROTULO_PERFIL: Record<string, string> = {
  GESTOR_PATRIMONIO: 'Gestor de Patrimônio',
  GESTOR_MANUTENCAO: 'Gestor de Manutenção',
  UNIDADE: 'Unidade de Atendimento',
  GALPAO: 'Galpão',
};

export const ROTULO_MOVIMENTACAO: Record<string, string> = {
  CADASTRO: 'Cadastro',
  IMPORTACAO_CSV: 'Importação CSV',
  ENVIO_MANUTENCAO: 'Envio para manutenção',
  RETORNO_MANUTENCAO: 'Retorno de manutenção',
  BAIXA: 'Baixa',
  CESSAO_USO: 'Cessão de uso',
  EMPRESTIMO: 'Empréstimo',
  DEVOLUCAO_EMPRESTIMO: 'Devolução de empréstimo',
  RECOLHA: 'Recolha',
  DESPACHO_GALPAO: 'Despacho do galpão',
  RECEBIMENTO_GALPAO: 'Recebimento no galpão',
  ATUALIZACAO_CADASTRO: 'Atualização de cadastro',
};
