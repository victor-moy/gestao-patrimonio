import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, OrigemRecurso, Perfil, TipoSolicitacao } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
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
  justificativa: z.string().min(5, 'informe a justificativa'),
  equipamentoId: z.string().uuid().optional(),
  unidadeDestinoId: z.string().uuid().optional(),
  tipoEquipamentoId: z.string().uuid().optional(),
  quantidade: z.number().int().positive().optional(),
  origemRecurso: z.nativeEnum(OrigemRecurso).optional(),
  dataRetornoPrevista: z.coerce.date().optional(),
});

solicitacoesRouter.post(
  '/',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  validarBody(criarSchema),
  async (req, res) => {
    const solicitacao = await service.criar(req.usuario!, req.body);
    res.status(201).json(solicitacao);
  },
);

// RN04 — somente o Gestor de Patrimônio aprova cessões e novos itens
solicitacoesRouter.post(
  '/:id/aprovar',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      ataId: z.string().uuid().optional(),
      valorVinculado: z.number().positive().optional(),
    }),
  ),
  async (req, res) => {
    res.json(await service.aprovar(req.usuario!, req.params.id, req.body));
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

solicitacoesRouter.post(
  '/:id/confirmar-saida',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.confirmarSaida(req.usuario!, req.params.id));
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-recebimento',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  validarBody(z.object({ estadoRecebimento: z.nativeEnum(EstadoConservacao).optional() })),
  async (req, res) => {
    res.json(
      await service.confirmarRecebimento(req.usuario!, req.params.id, req.body.estadoRecebimento),
    );
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-retorno',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    res.json(await service.confirmarRetorno(req.usuario!, req.params.id));
  },
);

// UC18 — galpão registra entrada física e cadastra tombamentos
solicitacoesRouter.post(
  '/:id/registrar-entrada',
  permitir(Perfil.GALPAO),
  validarBody(
    z.object({
      itens: z
        .array(
          z.object({
            tombamento: z.string().min(1),
            descricao: z.string().min(2),
            estadoConservacao: z.nativeEnum(EstadoConservacao),
            dataAquisicao: z.coerce.date().optional(),
          }),
        )
        .min(1),
    }),
  ),
  async (req, res) => {
    res.json(await service.registrarEntrada(req.usuario!, req.params.id, req.body.itens));
  },
);

solicitacoesRouter.post(
  '/:id/confirmar-recolha',
  permitir(Perfil.GALPAO),
  async (req, res) => {
    res.json(await service.confirmarRecolha(req.usuario!, req.params.id));
  },
);
