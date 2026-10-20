export type Perfil = 'OPERADOR' | 'UNIDADE' | 'GALPAO' | 'TERCEIRIZADA';

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
  // Perfil Terceirizada: o prestador de serviço que o usuário representa
  prestadorId?: string | null;
  prestadorNome?: string | null;
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
  permitePreventiva?: boolean;
  permiteCorretiva?: boolean;
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

export type TipoManutencao = 'EQUIPAMENTO' | 'CIVIL';

export type CategoriaProblemaCivil =
  | 'HIDRAULICA'
  | 'ELETRICA'
  | 'INFILTRACAO'
  | 'ALVENARIA_PINTURA'
  | 'COBERTURA'
  | 'ESQUADRIAS_VIDROS'
  | 'CLIMATIZACAO_CIVIL'
  | 'OUTROS';

export interface LinhaRelatorio {
  id: string;
  tipo: 'SERVICO' | 'MATERIAL';
  descricao: string;
  unidadeMedida: string | null;
  quantidade: string;
  // Preço final: o da tabela SINAPI já com o desconto do item de contrato
  valorUnitario: string;
  codigoSinapi?: string | null;
  precoSinapi?: string | null;
  descontoPercentual?: string | null;
  criadoEm: string;
}

export interface ItemSinapi {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  tipo: 'SERVICO' | 'MATERIAL';
  preco: string;
  referencia: string;
}

export type StatusManutencao =
  | 'PENDENTE_APROVACAO'
  | 'AGUARDANDO_PROVIDENCIAS'
  | 'NEGADA'
  | 'AGUARDANDO_ORCAMENTO'
  | 'ORCAMENTO_REGISTRADO'
  | 'AGUARDANDO_EXECUCAO'
  | 'EM_EXECUCAO'
  | 'AGUARDANDO_RETORNO'
  | 'AGUARDANDO_MEDICAO'
  | 'REENCAMINHAMENTO_SOLICITADO'
  | 'CONCLUIDA'
  | 'BAIXADO';

// Uma etapa da trajetória do caso (cadeia de atendimentos ligados por reencaminhamento)
export interface EtapaDoCaso {
  id: string;
  numero: number;
  tipo: TipoManutencao;
  titulo: string | null;
  status: StatusManutencao;
  criadoEm: string;
  dataConclusao: string | null;
  motivoReencaminhamento: string | null;
  reencaminhadoDeId: string | null;
  atual: boolean;
  // Sem acesso (prestador de outro contrato), a etapa aparece só como informação
  acessivel: boolean;
  prestador: string | null;
  baixa: { id: string; numero: number; status: string } | null;
}

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
  tipo: TipoManutencao;
  // Nome dado a quem abre o pedido (opcional; sem ele vale o nome do equipamento)
  titulo?: string | null;
  status: StatusManutencao;
  // Manutenção civil: local, tipo de problema, fotos protegidas e andamento da conferência
  localAfetado?: string | null;
  categoriaCivil?: CategoriaProblemaCivil | null;
  fotos?: string[];
  motivoPendencia?: string | null;
  motivoAjuste?: string | null;
  contestacaoUnidade?: string | null;
  conferidoMedicaoEm?: string | null;
  // Reencaminhamento: motivo escrito por quem atendia e a confirmação do Administrador
  motivoReencaminhamento?: string | null;
  reencaminhamentoConfirmadoEm?: string | null;
  reencaminhadoDeId?: string | null;
  casoId?: string | null;
  linhasRelatorio?: LinhaRelatorio[];
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
  // Nulo na manutenção civil
  equipamento: {
    id: string;
    tombamento: string;
    descricao: string;
    tipoEquipamento?: { nome: string; permitePreventiva?: boolean; permiteCorretiva?: boolean; preco?: string | null };
  } | null;
  unidade: { id: string; nome: string };
  solicitante: { nome: string };
  contrato?: { id: string; numero: string; prestador: { nome: string } } | null;
  contratoItem?: { id: string; valor: string; descontoPercentual?: string; servico: { nome: string }; escopo: { nome: string } } | null;
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
  // Nome dado a quem abre o pedido (opcional; sem ele vale o nome do item)
  titulo?: string | null;
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
  contagem: number;
  href: string;
}

export interface AvisoUsuario {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  href: string | null;
  solicitacaoId: string | null;
  manutencaoId: string | null;
  lidaEm: string | null;
  criadoEm: string;
}

export interface ListaAvisos {
  itens: AvisoUsuario[];
  total: number;
}

export interface VisaoGeralTipo {
  // Manutenção entra como mais um "tipo" ao lado dos de solicitação
  tipo: TipoSolicitacao | 'MANUTENCAO';
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
  MANUTENCAO: number;
}

export interface EmprestimoRelatorio {
  id: string;
  numero: number;
  titulo: string | null;
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
  numero: number;
  titulo: string | null;
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

export interface ContratoItem {
  id: string;
  servicoId: string;
  valor: string;
  // Desconto da proposta sobre a tabela SINAPI, em %
  descontoPercentual: string;
  escopoId: string;
  // Valor do item menos o já comprometido pelas manutenções vinculadas
  saldo: number;
  servico: { id: string; nome: string };
  escopo: { id: string; nome: string; cobrePreventiva: boolean; cobreCorretiva: boolean; cobreCivil?: boolean };
}

export interface Contrato {
  id: string;
  numero: string;
  prestadorId: string;
  prestador: { id: string; nome: string };
  objeto: string;
  // Soma dos itens (calculada pelo servidor); em contrato antigo sem itens, o valor que já existia
  valorTotal: string | null;
  status: StatusContrato;
  itens: ContratoItem[];
  vigenciaInicio: string;
  vigenciaFim: string;
  ativo: boolean;
}

export interface PrestadorServico {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  _count: { contratos: number };
}

export interface EscopoServico {
  id: string;
  nome: string;
  descricao: string | null;
  cobrePreventiva: boolean;
  cobreCorretiva: boolean;
  cobreCivil: boolean;
  _count: { itens: number };
}

export interface ServicoContrato {
  id: string;
  nome: string;
  descricao: string | null;
  _count: { itens: number };
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
  titulo?: string | null;
  tipoSolicitacao: string | null;
  item: string | null;
  unidade: string | null;
  ultimaEm: string;
  ultimoTexto: string;
  ultimoAutor: string;
  // Mensagens de outras pessoas ainda não lidas por quem está logado
  naoLidas: number;
}

export interface ChamadoParecido {
  id: string;
  numero: number;
  titulo: string | null;
  status: StatusManutencao;
  localAfetado: string | null;
  criadoEm: string;
}

export type SituacaoManutencao = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'NEGADA' | 'BAIXADO';

export interface ManutencaoRelatorio {
  id: string;
  numero: number;
  titulo: string | null;
  status: StatusManutencao;
  tipo: TipoManutencao;
  equipamento: string;
  tombamento: string | null;
  unidade: string;
  prestador: string | null;
  contrato: string | null;
  orcamento: number | null;
  custoFinal: number | null;
  // Orçamento a partir de 50% do preço de referência do item: reparo não sugerido
  naoSugerida: boolean;
  criadoEm: string;
  dataConclusao: string | null;
}

export interface RelatorioManutencoes {
  total: number;
  // A soma considerou só os registros mais recentes (limite do servidor)
  truncado: boolean;
  emAndamento: number;
  concluidas: number;
  negadas: number;
  baixadas: number;
  custoTotal: number;
  tempoMedioDias: number | null;
  orcamentosAltos: number;
  porMes: Array<{ mes: string; quantidade: number; custo: number }>;
  porPrestador: Array<{ prestadorId: string; prestador: string; quantidade: number; custo: number }>;
  porItem: Array<{ tipoEquipamentoId: string; nome: string; quantidade: number; custo: number }>;
  itensTotal: number;
  itens: ManutencaoRelatorio[];
}
