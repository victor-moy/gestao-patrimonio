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

export interface EventoManutencao {
  id: string;
  acao: string;
  criadoEm: string;
  usuario: string | null;
  perfil?: string;
}

export interface Manutencao {
  id: string;
  numero: number;
  status: StatusManutencao;
  descricaoProblema: string;
  // Só os chamados antigos têm justificativa; a abertura atual não pede mais
  justificativa?: string | null;
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

export interface EventoSolicitacao {
  id: string;
  acao: string;
  criadoEm: string;
  usuario: string | null;
  recebimentoOk?: boolean;
}

export interface Solicitacao {
  id: string;
  numero: number;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  justificativa: string;
  motivoNegacao: string | null;
  quantidade: number | null;
  origemRecurso: 'REGULAR' | 'EMENDA_PARLAMENTAR' | null;
  anexoUrl?: string | null;
  entidadeExternaNome?: string | null;
  numerosPatrimonio?: string[];
  dataRetornoPrevista: string | null;
  automatica: boolean;
  criadoEm: string;
  valorVinculado: string | null;
  unidadeOrigem: { id: string; nome: string };
  unidadeDestino?: { id: string; nome: string; tipo?: TipoUnidade } | null;
  equipamento?: {
    id: string;
    tombamento: string;
    descricao: string;
    tipoEquipamento?: { nome: string };
  } | null;
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
  // Calculado (não incrementado manualmente) — soma das solicitações
  // Reservado/Aguardando Entrega/Aguardando Validação desse tipo, agregada
  // entre todos os galpões (a reserva não fica presa a um galpão específico)
  reservado: number;
  ultimaEntradaEm: string | null;
  tipoEquipamento: TipoEquipamento & { categoria?: { nome: string; cor: string | null } };
  unidade: { id: string; nome: string };
}

export interface EstoqueAguardandoItem {
  tipoEquipamento: TipoEquipamento & { categoria?: { nome: string; cor: string | null } };
  quantidade: number;
  solicitacoes: number;
  aguardandoDesde: string | null;
}

export interface ResumoItem {
  itemNome: string;
  entregue: number;
  pendente: number;
  demandaQuantidade: number;
  demandaValor: number;
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

export interface Alerta {
  tipo: string;
  severidade: 'AVISO' | 'CRITICO';
  mensagem: string;
}

export interface VisaoGeralTipo {
  tipo: TipoSolicitacao;
  emAndamento: number;
  concluida: number;
  negadaCancelada: number;
}

export interface RankingUnidadeTipo {
  unidadeId: string;
  unidade: string;
  SUBSTITUICAO: number;
  AMPLIACAO: number;
  EMPRESTIMO: number;
  RECOLHA: number;
}

export interface EmprestimoRelatorio {
  id: string;
  equipamento: string | null;
  tombamento: string | null;
  unidadeOrigem: string;
  unidadeDestino: string | null;
  dataRetornoPrevista: string | null;
  status: StatusSolicitacao;
  atrasado: boolean;
  criadoEm: string;
}

export interface RelatorioEmprestimos {
  total: number;
  emAndamento: number;
  concluida: number;
  negadaCancelada: number;
  percentualAtraso: number;
  itens: EmprestimoRelatorio[];
}

export interface CessaoRelatorio {
  id: string;
  entidadeExternaNome: string | null;
  tipoEquipamento: string | null;
  numerosPatrimonio: string[];
  preco: number | null;
  unidadeOrigem: string;
  status: StatusSolicitacao;
  numeroPedidoBranet: string | null;
  dataConclusao: string | null;
  criadoEm: string;
}

export interface RelatorioCessoes {
  total: number;
  concluida: number;
  aguardandoBranet: number;
  valorTotal: number;
  itens: CessaoRelatorio[];
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

export interface MensagemChat {
  id: string;
  texto: string;
  criadoEm: string;
  autor: { id: string; nome: string; perfil: Perfil };
}

export interface ConversaResumo {
  contexto: 'solicitacao' | 'manutencao';
  id: string;
  numero: number;
  tipoSolicitacao: string | null;
  item: string | null;
  unidade: string | null;
  ultimaEm: string;
  ultimoTexto: string;
  ultimoAutor: string;
}
