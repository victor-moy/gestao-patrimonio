import { Router } from 'express';
import { z } from 'zod';
import { TipoDocumentoOS, EstadoConservacao, Perfil, StatusManutencao, TipoEncerramento, TipoManutencao } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir, permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import {
  assinaturaImagem,
  assinaturaPdf,
  MAX_FOTOS_CIVIL,
  removerArquivosUpload,
  uploadFotosCivil,
  uploadLaudoPdf,
} from '../../lib/uploads';
import * as service from './manutencoes.service';
import * as reencaminhamento from './manutencoes.reencaminhamento';
import * as os from './manutencoes.os';
import * as orcamento from './manutencoes.orcamento';
import { MAX_ARQUIVOS_ORCAMENTO } from './manutencoes.orcamento';

export const manutencoesRouter = Router();

manutencoesRouter.use(autenticar);

// Leitura: só quem trabalha com manutenção. O Galpão não tem acesso (e a terceirizada só vê as do seu contrato)
const leitura = permitirCom('MANUTENCAO_CONSULTAR', Perfil.UNIDADE, Perfil.TERCEIRIZADA);

// Minimização de dados: a terceirizada não precisa do e-mail institucional da unidade (usado só nos avisos do sistema)
// e os valores: o prestador lança itens e quantidades, mas não vê nem altera preços, descontos, saldo ou custo do chamado
// (decisão do cliente; só o administrativo, o fiscal e a medição enxergam valores)
type ComValores = {
  unidade: { emailBase?: string | null };
  custoFinal?: unknown;
  linhasRelatorio?: Array<Record<string, unknown>>;
  contratoItem?: Record<string, unknown> | null;
  tipo?: string;
};
function paraPerfil<T extends ComValores>(perfil: Perfil, manutencao: T): T {
  // As cotações do orçamento são do prestador, do fiscal e da avaliação; a Unidade não as vê
  if (perfil === Perfil.UNIDADE) return { ...manutencao, cotacoes: [] } as T;
  if (perfil !== Perfil.TERCEIRIZADA) return manutencao;
  const unidade = { ...manutencao.unidade };
  delete unidade.emailBase;
  if (manutencao.tipo !== 'CIVIL') return { ...manutencao, unidade } as T;
  const contratoItem = manutencao.contratoItem ? { ...manutencao.contratoItem } : manutencao.contratoItem;
  if (contratoItem) {
    delete contratoItem.valor;
    delete contratoItem.descontoPercentual;
  }
  const linhasRelatorio = manutencao.linhasRelatorio?.map((l) => {
    const sem = { ...l };
    for (const campo of ['valorUnitario', 'precoSinapi', 'descontoPercentual']) delete sem[campo];
    return sem;
  });
  return { ...manutencao, unidade, custoFinal: null, contratoItem, linhasRelatorio } as T;
}

const STATUS_MANUTENCAO = new Set<string>(Object.values(StatusManutencao));
const TIPOS_MANUTENCAO = new Set<string>(Object.values(TipoManutencao));

manutencoesRouter.get('/', leitura, async (req, res) => {
  const bruto = req.query.status;
  if (bruto !== undefined && (typeof bruto !== 'string' || !STATUS_MANUTENCAO.has(bruto))) {
    throw new AppError('Status inválido.', 422);
  }
  const tipo = req.query.tipo;
  if (tipo !== undefined && (typeof tipo !== 'string' || !TIPOS_MANUTENCAO.has(tipo))) {
    throw new AppError('Tipo de manutenção inválido.', 422);
  }
  const manutencoes = await service.listar(req.usuario!, {
    tipo: tipo as TipoManutencao | undefined,
    status: bruto as StatusManutencao | undefined,
    busca: typeof req.query.busca === 'string' ? req.query.busca : undefined,
    semInteracao: req.query.semInteracao === 'true',
  });
  res.json(manutencoes.map((m) => paraPerfil(req.usuario!.perfil, m)));
});

manutencoesRouter.get('/:id', leitura, async (req, res) => {
  res.json(paraPerfil(req.usuario!.perfil, await service.buscarPorId(req.usuario!, req.params.id)));
});

manutencoesRouter.get('/:id/historico', leitura, async (req, res) => {
  res.json(await service.historico(req.usuario!, req.params.id));
});

// Linha do tempo do caso (cadeia de atendimentos ligados por reencaminhamento)
manutencoesRouter.get('/:id/trajetoria', leitura, async (req, res) => {
  res.json(await reencaminhamento.trajetoria(req.usuario!, req.params.id));
});

const solicitarSchema = z.object({
  equipamentoId: z.string().uuid(),
  titulo: z
    .string({ error: 'Informe o título.' })
    .trim()
    .min(1, 'Informe o título.')
    .max(80, 'O título pode ter no máximo 80 caracteres.'),
  descricaoProblema: z.string().min(5, 'descreva o problema'),
});

const solicitarCivilSchema = z.object({
  titulo: solicitarSchema.shape.titulo,
  descricaoProblema: solicitarSchema.shape.descricaoProblema,
  // Setores da unidade (campo repetido no multipart); sem setores cadastrados na unidade, vale o texto livre do local
  setorIds: z.preprocess(
    (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.string().uuid('setor inválido')).max(20, 'Selecione no máximo 20 setores.'),
  ),
  localAfetado: z.string().trim().max(200, 'O local pode ter no máximo 200 caracteres.').optional(),
  categoriaCivilId: z.string().uuid('Selecione o tipo de problema.'),
  // Respostas às perguntas da categoria (JSON no multipart): { perguntaId: resposta }
  respostas: z.preprocess((v) => (typeof v === 'string' && v ? JSON.parse(v) : (v ?? {})), z.record(z.string().uuid(), z.string().trim().max(500))),
  unidadeId: z.string().uuid().optional(),
});

// Manutenção civil: problema em unidade, sala ou instalação, sem equipamento. Fotos opcionais (multipart, campo "fotos")
manutencoesRouter.post(
  '/civil',
  permitirCom('MANUTENCAO_ESCREVER', Perfil.UNIDADE),
  uploadFotosCivil.array('fotos', MAX_FOTOS_CIVIL),
  assinaturaImagem,
  async (req, res, next) => {
    const arquivos = Array.isArray(req.files) ? req.files : [];
    try {
      req.body = solicitarCivilSchema.parse(req.body);
      const fotos = arquivos.map((f) => `/uploads/solicitacoes/${f.filename}`);
      res.status(201).json(await service.solicitarCivil(req.usuario!, { ...req.body, fotos }));
    } catch (erro) {
      // Body inválido ou falha no service: as fotos já gravadas pelo multer não podem ficar órfãs
      await removerArquivosUpload(arquivos);
      if (erro instanceof z.ZodError) {
        const detalhes = erro.issues.map((e) => `${e.path.join('.') || 'corpo'}: ${e.message}`).join('; ');
        next(new AppError(`Dados inválidos — ${detalhes}`, 422));
        return;
      }
      next(erro);
    }
  },
);

// Chamados civis em aberto da mesma unidade e categoria (mostrados na abertura, para acrescentar em vez de repetir)
manutencoesRouter.get('/civil/abertos', permitirCom('MANUTENCAO_ESCREVER', Perfil.UNIDADE), async (req, res) => {
  const { categoriaCivilId, unidadeId } = z
    .object({ categoriaCivilId: z.string().uuid(), unidadeId: z.string().uuid().optional() })
    .parse(req.query);
  res.json(await service.abertosDaCategoria(req.usuario!, categoriaCivilId, unidadeId));
});

const novoProblemaSchema = z.object({
  descricao: solicitarSchema.shape.descricaoProblema.max(2000, 'A descrição pode ter no máximo 2000 caracteres.'),
});

// Outro problema da mesma categoria acrescentado a um chamado civil que ainda não foi ao prestador (fotos opcionais)
manutencoesRouter.post(
  '/:id/problemas',
  permitirCom('MANUTENCAO_ESCREVER', Perfil.UNIDADE),
  uploadFotosCivil.array('fotos', MAX_FOTOS_CIVIL),
  assinaturaImagem,
  async (req, res, next) => {
    const arquivos = Array.isArray(req.files) ? req.files : [];
    try {
      const dados = novoProblemaSchema.parse(req.body);
      const fotos = arquivos.map((f) => `/uploads/solicitacoes/${f.filename}`);
      res.status(201).json(await service.adicionarProblema(req.usuario!, req.params.id, { descricao: dados.descricao, fotos }));
    } catch (erro) {
      await removerArquivosUpload(arquivos);
      if (erro instanceof z.ZodError) {
        next(new AppError(`Dados inválidos — ${erro.issues.map((e) => `${e.path.join('.') || 'corpo'}: ${e.message}`).join('; ')}`, 422));
        return;
      }
      next(erro);
    }
  },
);

// UC05 — a Unidade solicita manutenção
manutencoesRouter.post(
  '/',
  permitirCom('MANUTENCAO_ESCREVER', Perfil.UNIDADE),
  validarBody(solicitarSchema),
  async (req, res) => {
    const manutencao = await service.solicitar(req.usuario!, req.body);
    res.status(201).json(manutencao);
  },
);

// RN03 — somente o Administrador decide
manutencoesRouter.post(
  '/:id/aprovar',
  permitirCom('MANUTENCAO_TRIAR'),
  validarBody(z.object({ contratoItemId: z.string().uuid('selecione o item de contrato que cobre a manutenção') })),
  async (req, res) => {
    res.json(await service.aprovar(req.usuario!, req.params.id, req.body.contratoItemId));
  },
);

// Avaliação técnica concluída: o chamado segue ao prestador do contrato escolhido na triagem
manutencoesRouter.post(
  '/:id/concluir-avaliacao',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(z.object({ parecer: z.string().trim().min(3, 'informe o parecer da avaliação técnica').max(1000) })),
  async (req, res) => {
    res.json(await service.concluirAvaliacaoTecnica(req.usuario!, req.params.id, req.body.parecer));
  },
);

const parecerSchema = z.object({ parecer: z.string().trim().min(3, 'informe o parecer').max(1000) });

// Avaliação técnica — saída 2: aprovado e devolvido à triagem (fila "já avaliados"), que atribui ao prestador
manutencoesRouter.post('/:id/devolver-avaliado', permitirCom('MANUTENCAO_AVALIAR'), validarBody(parecerSchema), async (req, res) => {
  res.json(await service.devolverAvaliadoATriagem(req.usuario!, req.params.id, req.body.parecer));
});

// O triador encaminha ao prestador um chamado já avaliado (pode trocar o item de contrato)
manutencoesRouter.post(
  '/:id/encaminhar-avaliado',
  permitirCom('MANUTENCAO_TRIAR'),
  validarBody(z.object({ contratoItemId: z.string().uuid().optional() })),
  async (req, res) => {
    res.json(await service.encaminharAvaliado(req.usuario!, req.params.id, req.body.contratoItemId));
  },
);

// Avaliação técnica — saída 3: faltam informações; volta à triagem, que contata o solicitante
manutencoesRouter.post(
  '/:id/solicitar-informacoes',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(z.object({ motivo: z.string().trim().min(3, 'diga o que falta').max(500) })),
  async (req, res) => {
    res.json(await service.solicitarInformacoes(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Avaliação técnica — saída 4: precisa visitar a unidade; depois da visita registra o parecer e decide de novo
manutencoesRouter.post('/:id/marcar-vistoria', permitirCom('MANUTENCAO_AVALIAR'), async (req, res) => {
  res.json(await service.marcarVistoria(req.usuario!, req.params.id));
});

manutencoesRouter.post(
  '/:id/registrar-vistoria',
  permitirCom(['MANUTENCAO_VISTORIAR', 'MANUTENCAO_AVALIAR']),
  validarBody(parecerSchema),
  async (req, res) => {
    res.json(await service.registrarVistoria(req.usuario!, req.params.id, req.body.parecer));
  },
);

// Avaliação técnica — "em análise": corrige qualquer campo do chamado e continua na avaliação
const edicaoAvaliacaoSchema = z
  .object({
    titulo: z.string().trim().max(80).optional(),
    descricaoProblema: z.string().trim().max(2000).optional(),
    unidadeId: z.string().uuid().optional(),
    equipamentoId: z.string().uuid().optional(),
    localAfetado: z.string().trim().max(200).nullable().optional(),
    categoriaCivilId: z.string().uuid().nullable().optional(),
    setorIds: z.array(z.string().uuid()).max(20).optional(),
    contratoItemId: z.string().uuid().optional(),
    orientacoesTerceirizada: z.string().trim().max(2000).nullable().optional(),
    parecerTecnico: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

manutencoesRouter.patch(
  '/:id/avaliacao',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(edicaoAvaliacaoSchema),
  async (req, res) => {
    res.json(await service.editarAvaliacao(req.usuario!, req.params.id, req.body));
  },
);

// Materiais previstos para o reparo (tabela SINAPI); o prestador os recebe já lançados no relatório
manutencoesRouter.post(
  '/:id/materiais',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(
    z.object({
      itemSinapiId: z.string().uuid('escolha um item da tabela SINAPI'),
      quantidade: z.number().positive('a quantidade deve ser positiva').max(1_000_000),
    }),
  ),
  async (req, res) => {
    res.status(201).json(await service.adicionarMaterialAvaliacao(req.usuario!, req.params.id, req.body));
  },
);

manutencoesRouter.delete('/:id/materiais/:linhaId', permitirCom('MANUTENCAO_AVALIAR'), async (req, res) => {
  res.json(await service.removerMaterialAvaliacao(req.usuario!, req.params.id, req.params.linhaId));
});

// Encerra na avaliação: encerrado, duplicado ou unificado (os dois últimos apontam para o chamado original)
manutencoesRouter.post(
  '/:id/encerrar',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(
    z.object({
      tipo: z.nativeEnum(TipoEncerramento),
      motivo: z.string().trim().min(3, 'informe o motivo').max(500),
      chamadoOriginalNumero: z.number().int().positive().optional(),
    }),
  ),
  async (req, res) => {
    res.json(await service.encerrarNaAvaliacao(req.usuario!, req.params.id, req.body));
  },
);

// Civil: chamados parecidos em aberto na mesma unidade (triagem)
manutencoesRouter.get('/:id/similares', permitirCom('MANUTENCAO_TRIAR'), async (req, res) => {
  res.json(await service.similares(req.usuario!, req.params.id));
});

// Triagem: parar o chamado com um motivo e retomá-lo depois, no mesmo ponto
manutencoesRouter.post(
  '/:id/bloquear',
  permitirCom('MANUTENCAO_TRIAR'),
  validarBody(z.object({ motivo: z.string().trim().min(3, 'informe o motivo do bloqueio').max(500) })),
  async (req, res) => {
    res.json(await service.bloquear(req.usuario!, req.params.id, req.body.motivo));
  },
);

manutencoesRouter.post('/:id/desbloquear', permitirCom('MANUTENCAO_TRIAR'), async (req, res) => {
  res.json(await service.desbloquear(req.usuario!, req.params.id));
});

manutencoesRouter.post(
  '/:id/negar',
  permitirCom('MANUTENCAO_TRIAR'),
  validarBody(z.object({ motivo: z.string().min(3, 'informe o motivo da negação') })),
  async (req, res) => {
    res.json(await service.negar(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Só a terceirizada do contrato lança o orçamento (o item de contrato é o escolhido na aprovação)
manutencoesRouter.post(
  '/:id/orcamento',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(
    z.object({
      // Manutenção civil ignora o valor: o orçamento é o total dos serviços e materiais lançados
      valor: z.number().positive('o valor do orçamento deve ser positivo').optional(),
      descricao: z.string().optional(),
    }),
  ),
  async (req, res) => {
    res.json(paraPerfil(req.usuario!.perfil, await service.registrarOrcamento(req.usuario!, req.params.id, req.body)));
  },
);

// Aceita boolean (JSON) ou 'true'/'false' (campo de texto vindo de multipart/form-data)
const booleanFlexivel = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');

// Laudo de baixa (RF16) é um upload de PDF — só é exigido quando aprovado=false
manutencoesRouter.post(
  '/:id/validar-orcamento',
  permitirCom('MANUTENCAO_AVALIAR'),
  uploadLaudoPdf.single('laudo'),
  assinaturaPdf,
  validarBody(z.object({ aprovado: booleanFlexivel, motivo: z.string().trim().max(500).optional() })),
  async (req, res) => {
    const laudoUrl = req.file ? `/uploads/laudos/${req.file.filename}` : undefined;
    res.json(
      await service.validarOrcamento(req.usuario!, req.params.id, {
        aprovado: req.body.aprovado,
        motivo: req.body.motivo,
        laudoBaixa: laudoUrl,
      }),
    );
  },
);

// Só a terceirizada confirma que o reparo terminou; depois disso Unidade e Administrador confirmam o retorno.
// Em execução, o Administrador não emite baixa nem marca retorno: a baixa só nasce da rejeição do orçamento.
manutencoesRouter.post(
  '/:id/registrar-retorno',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(
    z.object({
      custoFinal: z.number().positive('informe o custo real do reparo').optional(),
      // Chamado civil: dados da execução (a primeira vez; depois de ajustes do fiscal não precisam ser refeitos)
      entradaEm: z.coerce.date().optional(),
      saidaEm: z.coerce.date().optional(),
      resultado: z.enum(['TOTAL', 'PARCIAL']).optional(),
      observacao: z.string().trim().max(1000).optional(),
    }),
  ),
  async (req, res) => {
    const { custoFinal, entradaEm, saidaEm, resultado, observacao } = req.body;
    const execucao = entradaEm && saidaEm && resultado ? { entradaEm, saidaEm, resultado, observacao } : undefined;
    res.json(paraPerfil(req.usuario!.perfil, await service.registrarRetorno(req.usuario!, req.params.id, custoFinal, execucao)));
  },
);

// RN11 — confirmação dupla (Unidade + Administrador)
manutencoesRouter.post(
  '/:id/confirmar-retorno',
  permitirCom('MANUTENCAO_FISCALIZAR', Perfil.UNIDADE),
  validarBody(z.object({ estadoPosManutencao: z.nativeEnum(EstadoConservacao).optional() })),
  async (req, res) => {
    res.json(
      await service.confirmarRetorno(req.usuario!, req.params.id, req.body.estadoPosManutencao),
    );
  },
);

// Civil — serviços e materiais executados, informados pelo prestador: itens da tabela SINAPI com quantidade; o preço vem da tabela com o desconto do item de contrato
manutencoesRouter.post(
  '/:id/relatorio',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(
    z.object({
      itemSinapiId: z.string().uuid('escolha um item da tabela SINAPI'),
      quantidade: z.number().positive('a quantidade deve ser positiva').max(1_000_000),
    }),
  ),
  async (req, res) => {
    res.status(201).json(paraPerfil(req.usuario!.perfil, await service.adicionarLinhaRelatorio(req.usuario!, req.params.id, req.body)));
  },
);

manutencoesRouter.delete('/:id/relatorio/:linhaId', permitir(Perfil.TERCEIRIZADA), async (req, res) => {
  res.json(paraPerfil(req.usuario!.perfil, await service.removerLinhaRelatorio(req.usuario!, req.params.id, req.params.linhaId)));
});

// Civil — orçamento prévio (serviço fora da SINAPI ou que o contrato exige aprovar antes): a avaliação técnica solicita...
manutencoesRouter.post(
  '/:id/solicitar-orcamento',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(z.object({ instrucoes: z.string().trim().min(3, 'diga o que precisa ser orçado').max(2000) })),
  async (req, res) => {
    res.json(await orcamento.solicitarOrcamento(req.usuario!, req.params.id, req.body.instrucoes));
  },
);

// ...ou dispensa o orçamento em risco à vida (o chamado vai ao prestador, com a justificativa registrada)
manutencoesRouter.post(
  '/:id/dispensar-orcamento',
  permitirCom('MANUTENCAO_AVALIAR'),
  validarBody(z.object({ justificativa: z.string().trim().min(10, 'explique o risco à vida').max(1000) })),
  async (req, res) => {
    res.json(await orcamento.dispensarOrcamento(req.usuario!, req.params.id, req.body.justificativa));
  },
);

// ...o prestador envia os PDFs do orçamento (uma entrega por rodada)...
manutencoesRouter.post(
  '/:id/cotacoes',
  permitir(Perfil.TERCEIRIZADA),
  uploadLaudoPdf.array('arquivos', MAX_ARQUIVOS_ORCAMENTO),
  assinaturaPdf,
  async (req, res, next) => {
    const arquivos = Array.isArray(req.files) ? req.files : [];
    try {
      if (arquivos.length === 0) throw new AppError('Anexe o orçamento em PDF.', 422);
      res.status(201).json(paraPerfil(req.usuario!.perfil, await orcamento.enviarOrcamento(req.usuario!, req.params.id, arquivos.map((f) => `/uploads/laudos/${f.filename}`))));
    } catch (erro) {
      // Qualquer falha depois do upload: os PDFs já gravados não podem ficar órfãos
      await removerArquivosUpload(arquivos);
      next(erro);
    }
  },
);

// ...e o fiscal aprova, informando o valor aprovado, ou rejeita
manutencoesRouter.post(
  '/:id/aprovar-cotacao',
  permitirCom('MANUTENCAO_FISCALIZAR'),
  validarBody(z.object({ valor: z.coerce.number({ error: 'informe o valor aprovado' }).positive('informe o valor aprovado').max(999_999_999) })),
  async (req, res) => {
    res.json(await orcamento.aprovarOrcamento(req.usuario!, req.params.id, req.body.valor));
  },
);

manutencoesRouter.post(
  '/:id/rejeitar-cotacoes',
  permitirCom('MANUTENCAO_FISCALIZAR'),
  validarBody(z.object({ motivo: z.string().trim().min(3, 'informe o motivo').max(500) })),
  async (req, res) => {
    res.json(await orcamento.rejeitarOrcamento(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Civil — o prestador gera a ordem de serviço (uma por chamado): equipe, dia e escopo. O chamado passa a "em rota"
manutencoesRouter.post(
  '/:id/gerar-os',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(
    z.object({
      equipe: z.string().trim().min(2, 'informe a equipe').max(200),
      dataPrevista: z.coerce.date({ error: 'informe o dia da visita' }),
      escopo: z.string().trim().min(3, 'descreva o escopo do serviço').max(2000),
    }),
  ),
  async (req, res) => {
    res.status(201).json(paraPerfil(req.usuario!.perfil, await os.gerarOS(req.usuario!, req.params.id, req.body)));
  },
);

// Civil — OS assinada (em papel, digitalizada), em PDF. Depois de enviado não se edita.
manutencoesRouter.post(
  '/:id/documentos',
  permitir(Perfil.TERCEIRIZADA),
  uploadLaudoPdf.single('arquivo'),
  assinaturaPdf,
  async (req, res, next) => {
    try {
      // Só a OS assinada é documento da OS (o relatório de execução saiu: o que ele trazia está na própria OS)
      const { tipo } = z.object({ tipo: z.literal(TipoDocumentoOS.OS_ASSINADA, { error: 'Informe o tipo do documento: OS assinada.' }) }).parse(req.body);
      if (!req.file) throw new AppError('Anexe o documento em PDF.', 422);
      res.status(201).json(paraPerfil(req.usuario!.perfil, await os.enviarDocumento(req.usuario!, req.params.id, { tipo, arquivo: `/uploads/laudos/${req.file.filename}` })));
    } catch (erro) {
      // Qualquer falha depois do upload: o PDF já gravado não pode ficar órfão
      if (req.file) await removerArquivosUpload([req.file]);
      if (erro instanceof z.ZodError) {
        next(new AppError(`Dados inválidos — ${erro.issues.map((e) => e.message).join('; ')}`, 422));
        return;
      }
      next(erro);
    }
  },
);

// Civil — o fiscal recusa um documento enviado; o prestador envia outro
manutencoesRouter.post(
  '/:id/documentos/:documentoId/recusar',
  permitirCom('MANUTENCAO_FISCALIZAR'),
  validarBody(z.object({ motivo: z.string().trim().min(3, 'informe o motivo da recusa').max(500) })),
  async (req, res) => {
    res.json(await os.recusarDocumento(req.usuario!, req.params.id, req.params.documentoId, req.body.motivo));
  },
);

// Civil — a Unidade contesta a execução (o problema persiste)
manutencoesRouter.post(
  '/:id/contestar',
  permitir(Perfil.UNIDADE),
  validarBody(z.object({ motivo: z.string().trim().min(5, 'explique por que o problema persiste').max(500) })),
  async (req, res) => {
    res.json(await reencaminhamento.contestarComSubchamado(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Civil — o Administrador pede ajustes nos serviços informados: o chamado volta à execução
manutencoesRouter.post(
  '/:id/solicitar-ajustes',
  permitirCom('MANUTENCAO_FISCALIZAR'),
  validarBody(z.object({ motivo: z.string().trim().min(5, 'explique o que precisa ser ajustado').max(500) })),
  async (req, res) => {
    res.json(await service.solicitarAjustes(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Civil — aprovação final do Administrador, depois da confirmação da Unidade (autoriza a medição)
manutencoesRouter.post('/:id/autorizar-medicao', permitirCom('MANUTENCAO_FISCALIZAR'), async (req, res) => {
  res.json(await service.autorizarMedicao(req.usuario!, req.params.id));
});

// Reencaminhamento — a Terceirizada do contrato pede para passar o chamado adiante, só com o motivo; o Administrador só age depois
manutencoesRouter.post(
  '/:id/solicitar-reencaminhamento',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(z.object({ motivo: z.string().trim().min(10, 'explique por que o chamado precisa ser reencaminhado').max(500) })),
  async (req, res) => {
    const m = await reencaminhamento.solicitarReencaminhamento(req.usuario!, req.params.id, req.body.motivo);
    res.json(paraPerfil(req.usuario!.perfil, m));
  },
);

// Reencaminhamento — o Administrador confirma o pedido e só depois decide o destino
manutencoesRouter.post('/:id/confirmar-reencaminhamento', permitirCom('MANUTENCAO_TRIAR'), async (req, res) => {
  res.json(await reencaminhamento.confirmarReencaminhamento(req.usuario!, req.params.id));
});

const novoChamadoSchema = z.object({
  tipo: z.nativeEnum(TipoManutencao, { error: 'Informe o tipo do novo chamado.' }),
  equipamentoId: z.string().uuid().optional(),
  titulo: solicitarSchema.shape.titulo.optional(),
  descricaoProblema: solicitarSchema.shape.descricaoProblema.optional(),
  localAfetado: z.string().trim().min(2, 'Informe o local afetado.').max(200, 'O local pode ter no máximo 200 caracteres.').optional(),
  categoriaCivilId: z.string().uuid().optional(),
});

// Reencaminhamento — decisão 1: abre um novo chamado de manutenção (sem prestador) na triagem
manutencoesRouter.post('/:id/reencaminhar/manutencao', permitirCom('MANUTENCAO_TRIAR'), validarBody(novoChamadoSchema), async (req, res) => {
  res.status(201).json(await reencaminhamento.reencaminharParaManutencao(req.usuario!, req.params.id, req.body));
});

// Reencaminhamento — decisão 2: baixa do equipamento, com o mesmo laudo em PDF e a substituição automática de sempre
manutencoesRouter.post(
  '/:id/reencaminhar/baixa',
  permitirCom('MANUTENCAO_AVALIAR'),
  uploadLaudoPdf.single('laudo'),
  assinaturaPdf,
  async (req, res) => {
    if (!req.file) throw new AppError('Anexe o laudo de baixa em PDF.', 422);
    res.json(await reencaminhamento.reencaminharParaBaixa(req.usuario!, req.params.id, `/uploads/laudos/${req.file.filename}`));
  },
);
