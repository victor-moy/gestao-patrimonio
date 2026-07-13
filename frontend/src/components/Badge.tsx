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
  // Status de manutenção/solicitação
  PENDENTE_APROVACAO: 'yellow',
  AGUARDANDO_ORCAMENTO: 'blue',
  ORCAMENTO_REGISTRADO: 'blue',
  EM_EXECUCAO: 'blue',
  AGUARDANDO_RETORNO: 'yellow',
  AGUARDANDO_SAIDA: 'yellow',
  AGUARDANDO_RECEBIMENTO: 'yellow',
  AGUARDANDO_ENTREGA: 'yellow',
  APROVADA: 'green',
  APROVADA_AGUARDANDO_ATA: 'blue',
  CONCLUIDA: 'green',
  NEGADA: 'red',
  CANCELADA: 'gray',
  // Tipos de solicitação
  NOVO_ITEM: 'blue',
  CESSAO_USO: 'purple',
  EMPRESTIMO: 'blue',
  RECOLHA: 'yellow',
};

export function Badge({ valor, children }: { valor: string; children: ReactNode }) {
  const cor = CORES[valor] ?? 'gray';
  return <span className={`badge badge-${cor}`}>{children}</span>;
}
