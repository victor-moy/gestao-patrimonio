export type Perfil = 'GESTOR_PATRIMONIO' | 'GESTOR_MANUTENCAO' | 'UNIDADE' | 'GALPAO';

export type EstadoConservacao = 'OTIMO' | 'BOM' | 'REGULAR' | 'RUIM' | 'PESSIMO';
export type StatusEquipamento = 'ATIVO' | 'EM_MANUTENCAO' | 'EMPRESTADO' | 'BAIXADO' | 'CEDIDO';
export type MotivoBaixa = 'LEILAO' | 'EXTRAVIO' | 'ROUBO' | 'SUBSTITUICAO' | 'OUTRO';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  perfil: Perfil;
  unidadeId: string | null;
  unidadeNome?: string | null;
  ativo?: boolean;
}

export type TipoUnidade =
  | 'UBSF'
  | 'UPA'
  | 'PA'
  | 'FARMACIA'
  | 'SERVICO_ESPECIAL'
  | 'SERVICO_VIGILANCIA'
  | 'UNIDADE_ADMINISTRATIVA'
  | 'GALPAO'
  | 'OUTRO';

export interface Unidade {
  id: string;
  nome: string;
  tipo: TipoUnidade;
  endereco?: string | null;
  emailBase?: string | null;
  responsavelId?: string | null;
  responsavel?: { id: string; nome: string } | null;
  ativo: boolean;
}

export interface TipoEquipamento {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  imagemUrl?: string | null;
  preco?: string | null;
  categoriaId: string;
  categoria?: { nome: string };
  quantidadeEquipamentos?: number;
}

export interface Categoria {
  id: string;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  tipos: TipoEquipamento[];
}

export interface Movimentacao {
  id: string;
  tipo: string;
  descricao: string;
  criadoEm: string;
  unidadeOrigem?: { nome: string } | null;
  unidadeDestino?: { nome: string } | null;
  usuario?: { nome: string } | null;
}

export interface Equipamento {
  id: string;
  tombamento: string;
  descricao: string;
  estadoConservacao: EstadoConservacao;
  status: StatusEquipamento;
  motivoBaixa?: MotivoBaixa | null;
  emendaParlamentar: boolean;
  dataAquisicao: string | null;
  observacoes: string | null;
  tipoEquipamento: TipoEquipamento & { categoria?: { nome: string } };
  unidade: { id: string; nome: string };
  unidadeTemporaria?: { id: string; nome: string } | null;
  movimentacoes?: Movimentacao[];
  manutencoes?: Array<{
    id: string;
    status: string;
    descricaoProblema: string;
    custoFinal: string | null;
    orcamentoValor: string | null;
    criadoEm: string;
    dataConclusao: string | null;
  }>;
}

export type StatusManutencao =
  | 'PENDENTE_APROVACAO'
  | 'NEGADA'
  | 'AGUARDANDO_ORCAMENTO'
  | 'ORCAMENTO_REGISTRADO'
  | 'EM_EXECUCAO'
  | 'AGUARDANDO_RETORNO'
  | 'CONCLUIDA'
  | 'BAIXADO';

export interface Manutencao {
  id: string;
  status: StatusManutencao;
  descricaoProblema: string;
  justificativa: string;
  motivoNegacao: string | null;
  orcamentoValor: string | null;
  orcamentoDescricao: string | null;
  laudoBaixa: string | null;
  confirmadoUnidade: boolean;
  confirmadoGestor: boolean;
  custoFinal: string | null;
  criadoEm: string;
  dataConclusao: string | null;
  equipamento: {
    id: string;
    tombamento: string;
    descricao: string;
    tipoEquipamento?: { nome: string };
  };
  unidade: { id: string; nome: string };
  solicitante: { nome: string };
  contrato?: { id: string; empresa: string } | null;
}

export type TipoSolicitacao = 'SUBSTITUICAO' | 'AMPLIACAO' | 'CESSAO_USO' | 'EMPRESTIMO' | 'RECOLHA';

export type StatusSolicitacao =
  | 'PENDENTE_APROVACAO'
  | 'NEGADA'
  | 'APROVADA'
  | 'APROVADA_AGUARDANDO_ATA'
  | 'AGUARDANDO_SAIDA'
  | 'AGUARDANDO_RECEBIMENTO'
  | 'AGUARDANDO_RETORNO'
  | 'AGUARDANDO_ENTREGA'
  | 'CONCLUIDA'
  | 'CANCELADA'
  | 'EXPIRADA'
  | 'RESERVADO'
  | 'AGUARDANDO_DISPONIBILIDADE'
  | 'AGUARDANDO_VALIDACAO';

export interface Solicitacao {
  id: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  justificativa: string;
  motivoNegacao: string | null;
  quantidade: number | null;
  origemRecurso: 'REGULAR' | 'EMENDA_PARLAMENTAR' | null;
  anexoUrl?: string | null;
  entidadeExternaNome?: string | null;
  dataRetornoPrevista: string | null;
  automatica: boolean;
  criadoEm: string;
  valorVinculado: string | null;
  unidadeOrigem: { id: string; nome: string };
  unidadeDestino?: { id: string; nome: string; tipo?: TipoUnidade } | null;
  equipamento?: { id: string; tombamento: string; descricao: string } | null;
  tipoEquipamento?: { id: string; nome: string; codigo: string } | null;
  ata?: { id: string; numero: string } | null;
  criadoPor?: { nome: string } | null;
  disponivelParaReserva?: boolean;
  numeroPedidoBranet?: string | null;
  pedidoEntregaRegistradoEm?: string | null;
  prioridade?: number | null;
  recebimentoOk?: boolean | null;
  observacaoRecebimento?: string | null;
  itensGerados?: Array<{ id: string; tombamento: string; descricao: string }>;
}

export interface Ata {
  id: string;
  numero: string;
  fornecedor: string;
  descricao: string;
  valorTotal: string;
  saldo: string;
  vencimento: string;
  unidadeEspecifica?: { id: string; nome: string } | null;
  ativo: boolean;
}

export interface EstoqueItem {
  id: string;
  quantidade: number;
  reservado: number;
  ultimaEntradaEm: string | null;
  tipoEquipamento: TipoEquipamento & { categoria?: { nome: string; cor: string | null } };
  unidade: { id: string; nome: string };
}

export interface MovimentacaoEstoque {
  id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  quantidade: number;
  atualizadoNoBranet: boolean;
  criadoEm: string;
  estoque: { tipoEquipamento: { nome: string; codigo: string } };
  unidadeDestino: { id: string; nome: string } | null;
  usuario: { id: string; nome: string } | null;
}

export interface DashboardData {
  totalEquipamentos: number;
  emManutencao: number;
  tempoMedioManutencaoDias: number;
  custoMesAtual: number;
  custoSemestral: Array<{ mes: string; custo: number }>;
  equipamentosPorUnidade: Array<{ unidadeId: string; unidade: string; quantidade: number }>;
  rankingSolicitacoes: Array<{ unidadeId: string; unidade: string; quantidade: number }>;
}

export interface Alerta {
  tipo: string;
  severidade: 'AVISO' | 'CRITICO';
  mensagem: string;
}

export type StatusContrato = 'ATIVO' | 'RENOVACAO_PENDENTE' | 'EXPIRADO';

export interface Contrato {
  id: string;
  numero: string;
  empresa: string;
  cnpj: string | null;
  tipo: string;
  objeto: string;
  valorTotal: string | null;
  condicoesPagamento: string | null;
  status: StatusContrato;
  observacoes: string | null;
  vigenciaInicio: string;
  vigenciaFim: string;
  ativo: boolean;
}
