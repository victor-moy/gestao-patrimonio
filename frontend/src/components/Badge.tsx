import type { ReactNode } from 'react';

const CORES: Record<string, string> = {
  // Estado de conservação
  OTIMO: 'green',
  BOM: 'blue',
  REGULAR: 'yellow',
  RUIM: 'red',
  PESSIMO: 'red',
  // Status de equipamento
  ATIVO: 'gray',
  EM_MANUTENCAO: 'yellow',
  EMPRESTADO: 'purple',
  BAIXADO: 'red',
  CEDIDO: 'purple',
  // Status de manutenção/solicitação
  PENDENTE_APROVACAO: 'yellow',
  AGUARDANDO_ORCAMENTO: 'blue',
  ORCAMENTO_REGISTRADO: 'blue',
  EM_EXECUCAO: 'blue',
  AGUARDANDO_RETORNO: 'yellow',
  AGUARDANDO_SAIDA: 'yellow',
  AGUARDANDO_RECEBIMENTO: 'yellow',
  AGUARDANDO_ENTREGA: 'yellow',
  CONCLUIDA: 'green',
  NEGADA: 'red',
  EXPIRADA: 'gray',
  RESERVADO: 'blue',
  AGUARDANDO_DISPONIBILIDADE: 'yellow',
  AGUARDANDO_VALIDACAO: 'yellow',
  // Pseudo-status: Aguardando Disponibilidade com estoque já disponível
  DISPONIVEL_PARA_RESERVA: 'green',
  // Pseudo-status: etapas da Recolha (feedback do cliente 26/08)
  AGUARDANDO_RECOLHA_PATRIMONIO: 'yellow',
  AGUARDANDO_RECOLHA_BRANET: 'blue',
  // Tipos de solicitação
  SUBSTITUICAO: 'blue',
  AMPLIACAO: 'blue',
  CESSAO_USO: 'purple',
  EMPRESTIMO: 'blue',
  RECOLHA: 'yellow',
};

export function Badge({ valor, children }: { valor: string; children: ReactNode }) {
  const cor = CORES[valor] ?? 'gray';
  return <span className={`badge badge-${cor}`}>{children}</span>;
}
