import type { ReactNode } from 'react';

// Fonte única da cor de status (ver "Cores de status" em documentation/DESIGN-SYSTEM.md):
//   verde    terminou bem ou está disponível
//   azul     em andamento, sem ninguém travando
//   amarelo  precisa de uma ação ou merece atenção
//   vermelho recusado ou com problema
//   cinza    encerrado ou inativo, sem juízo de valor (também é o padrão de um valor desconhecido)
// Roxo não é cor de status: fica para etiquetas de classificação (Emenda).
const CORES: Record<string, 'green' | 'blue' | 'yellow' | 'red' | 'gray'> = {
  // Estado de conservação
  OTIMO: 'green',
  BOM: 'green',
  REGULAR: 'yellow',
  RUIM: 'red',
  PESSIMO: 'red',
  // Equipamento
  ATIVO: 'green',
  EM_MANUTENCAO: 'yellow',
  EMPRESTADO: 'blue',
  CEDIDO: 'gray',
  BAIXADO: 'gray',
  // Manutenção e solicitação
  PENDENTE_APROVACAO: 'yellow',
  AGUARDANDO_PROVIDENCIAS: 'yellow',
  AGUARDANDO_ORCAMENTO: 'blue',
  ORCAMENTO_REGISTRADO: 'yellow',
  AGUARDANDO_EXECUCAO: 'blue',
  EM_EXECUCAO: 'blue',
  AGUARDANDO_RETORNO: 'yellow',
  AGUARDANDO_MEDICAO: 'yellow',
  AGUARDANDO_SAIDA: 'yellow',
  AGUARDANDO_RECEBIMENTO: 'yellow',
  AGUARDANDO_ENTREGA: 'yellow',
  CONCLUIDA: 'green',
  NEGADA: 'red',
  EXPIRADA: 'gray',
  RESERVADO: 'blue',
  AGUARDANDO_DISPONIBILIDADE: 'yellow',
  AGUARDANDO_VALIDACAO: 'yellow',
  // Pseudo-status de solicitação (ver statusExibido)
  DISPONIVEL_PARA_RESERVA: 'green',
  AGUARDANDO_RECOLHA_PATRIMONIO: 'yellow',
  AGUARDANDO_RECOLHA_BRANET: 'blue',
  // Atas
  ATIVA: 'green',
  VENCENDO: 'yellow',
  VENCIDA: 'red',
  INATIVA: 'gray',
  SALDO_BAIXO: 'red',
  // Manutenção cujo orçamento passou de 50% do preço de referência do item
  NAO_SUGERIDA: 'yellow',
  // Contratos
  RENOVACAO_PENDENTE: 'yellow',
  EXPIRADO: 'red',
  // Estoque
  OK: 'green',
  BAIXO: 'yellow',
  ESGOTADO: 'red',
  // Cadastros e empréstimos
  INATIVO: 'gray',
  ATRASADO: 'red',
};

export function corDoStatus(valor: string) {
  return CORES[valor] ?? 'gray';
}

/** Selo de status: texto com ponto colorido, na cor definida por `corDoStatus(valor)`. */
export function StatusPill({ valor, children }: { valor: string; children: ReactNode }) {
  return (
    <span className={`inventario-status inventario-status--tom-${corDoStatus(valor)}`}>
      <span aria-hidden />
      {children}
    </span>
  );
}
