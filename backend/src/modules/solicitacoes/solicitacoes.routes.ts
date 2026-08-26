import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, OrigemRecurso, Perfil, TipoSolicitacao } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { uploadAnexoSolicitacao } from '../../lib/uploads';
import * as service from './solicitacoes.service';

export const solicitacoesRouter = Router();

solicitacoesRouter.use(autenticar);

solicitacoesRouter.get('/', async (req, res) => {
  const solicitacoes = await service.listar(req.usuario!, {
    tipo: req.query.tipo as string | undefined,
    status: req.query.status as string | undefined,
    busca: req.query.busca as string | undefined,
  });
  res.json(solicitacoes);
});

solicitacoesRouter.get('/:id', async (req, res) => {
  res.json(await service.buscarPorId(req.usuario!, req.params.id));
});

const criarSchema = z.object({
  tipo: z.nativeEnum(TipoSolicitacao),
  // Obrigatória pra todos os tipos, exceto Substituição (que valida a
  // justificativa por item, no service) — feedback do cliente 25/08.
  justificativa: z.string().min(5, 'informe a justificativa').optional(),
  equipamentoId: z.string().uuid().optional(),
  unidadeDestinoId: z.string().uuid().optional(),
  tipoEquipamentoId: z.string().uuid().optional(),
  quantidade: z.number().int().positive().optional(),
  // Ampliação/Substituição: seleção de múltiplos itens numa única solicitação
  // — o sistema cria uma Solicitacao por item internamente (feedback 17/08 e
  // 25/08). Substituição usa também `equipamentoId` e `justificativa` por
  // item (equipamento existente a ser substituído e motivo específico da
  // troca); Ampliação não usa esses campos.
  itens: z
    .array(
      z.object({
        equipamentoId: z.string().uuid().optional(),
        tipoEquipamentoId: z.string().uuid(),
        quantidade: z.number().int().positive(),
        justificativa: z.string().min(5, 'informe a justificativa').optional(),
      }),
    )
    .optional(),
  origemRecurso: z.nativeEnum(OrigemRecurso).optional(),
  entidadeExternaNome: z.string().min(2).optional(),
  dataRetornoPrevista: z.coerce.date().optional(),
});

solicitacoesRouter.post(
  '/',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  validarBody(criarSchema),
  async (req, res) => {
    const ids = await service.criar(req.usuario!, req.body);
    res.status(201).json({ ids });
  },
);

// RN04 — somente o Gestor de Patrimônio aprova. Pra Ampliação/Substituição o
// próprio sistema decide reservado ou aguardando disponibilidade. Prioridade
// (1–3, opcional) é definida pelo Gestor, não pelo solicitante (feedback 17/08).
solicitacoesRouter.post(
  '/:id/aprovar',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(z.object({ prioridade: z.number().int().min(1).max(3).optional() })),
  async (req, res) => {
    res.json(await service.aprovar(req.usuario!, req.params.id, req.body.prioridade));
  },
);

solicitacoesRouter.post(
  '/:id/negar',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(z.object({ motivo: z.string().min(3, 'informe o motivo') })),
  async (req, res) => {
    res.json(await service.negar(req.usuario!, req.params.id, req.body.motivo));
  },
);

// FA04 — retomada manual do vínculo quando surge ata com saldo
solicitacoesRouter.post(
  '/:id/vincular-ata',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      ataId: z.string().uuid(),
      valorVinculado: z.number().positive(),
    }),
  ),
  async (req, res) => {
    res.json(
      await service.vincularAta(req.usuario!, req.params.id, req.body.ataId, req.body.valorVinculado),
    );
  },
);

// Retry manual de reserva de estoque pra quem está aguardando disponibilidade
solicitacoesRouter.post(
  '/:id/tentar-reservar-estoque',
  permitir(Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.tentarReservarEstoque(req.usuario!, req.params.id));
  },
);

// Gestor de Patrimônio marca que o pedido foi lançado no Branet (RESERVADO →
// AGUARDANDO_ENTREGA), informando o número do pedido e o tombamento de cada
// item — não é mais uma etapa separada do Galpão (feedback 17/08)
solicitacoesRouter.post(
  '/:id/lancar-branet',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      numeroPedidoBranet: z.string().min(1, 'informe o número do pedido'),
      itens: z
        .array(
          z.object({
            tombamento: z.string().min(1),
            descricao: z.string().min(2),
            dataAquisicao: z.coerce.date().optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (req, res) => {
    res.json(
      await service.marcarLancadoBranet(
        req.usuario!,
        req.params.id,
        req.body.numeroPedidoBranet,
        req.body.itens,
      ),
    );
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-saida',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.confirmarSaida(req.usuario!, req.params.id));
  },
);

const confirmarRecebimentoSchema = z.object({
  // Empréstimo (fluxo antigo, inalterado): 5 níveis de conservação
  estadoRecebimento: z.nativeEnum(EstadoConservacao).optional(),
  // Ampliação/Substituição (feedback 17/08): OK/Não OK binário
  ok: z.boolean().optional(),
  observacao: z.string().optional(),
  itens: z
    .array(
      z.object({
        equipamentoId: z.string().uuid(),
        tombamentoConfirmado: z.string().min(1),
      }),
    )
    .optional(),
});

solicitacoesRouter.post(
  '/:id/confirmar-recebimento',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  validarBody(confirmarRecebimentoSchema),
  async (req, res) => {
    res.json(await service.confirmarRecebimento(req.usuario!, req.params.id, req.body));
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-retorno',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.confirmarRetorno(req.usuario!, req.params.id));
  },
);

// Exceção estreita à RN01 (tombamento imutável): só pros itens gerados por
// esta solicitação, e só enquanto aguarda validação — corrige uma divergência
// apontada na confirmação de recebimento antes de concluir (feedback 17/08)
solicitacoesRouter.patch(
  '/:id/ajustar-tombamento',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      itens: z
        .array(
          z.object({
            equipamentoId: z.string().uuid(),
            tombamento: z.string().min(1),
            descricao: z.string().min(2).optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (req, res) => {
    res.json(await service.ajustarTombamento(req.usuario!, req.params.id, req.body.itens));
  },
);

// Validação final do Gestor de Patrimônio, depois que a unidade já confirmou
solicitacoesRouter.post(
  '/:id/concluir',
  permitir(Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.concluirSolicitacao(req.usuario!, req.params.id));
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-recolha',
  permitir(Perfil.GALPAO),
  async (req, res) => {
    res.json(await service.confirmarRecolha(req.usuario!, req.params.id));
  },
);

// Anexo (opcional, qualquer tipo de solicitação) — PDF ou imagem, comprovante
// de que a ampliação foi autorizada dentro de um projeto interno
solicitacoesRouter.post(
  '/:id/anexo',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  uploadAnexoSolicitacao.single('anexo'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('Envie o anexo no campo "anexo".', 422);
    }
    const anexoUrl = `/uploads/solicitacoes/${req.file.filename}`;
    res.json(await service.anexarArquivo(req.usuario!, req.params.id, anexoUrl));
  },
);
