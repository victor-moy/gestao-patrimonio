import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import * as service from './manutencoes.service';

export const manutencoesRouter = Router();

manutencoesRouter.use(autenticar);

manutencoesRouter.get('/', async (req, res) => {
  const manutencoes = await service.listar(req.usuario!, {
    status: req.query.status as string | undefined,
    busca: req.query.busca as string | undefined,
  });
  res.json(manutencoes);
});

manutencoesRouter.get('/:id', async (req, res) => {
  res.json(await service.buscarPorId(req.usuario!, req.params.id));
});

const solicitarSchema = z.object({
  equipamentoId: z.string().uuid(),
  descricaoProblema: z.string().min(5, 'descreva o problema'),
  justificativa: z.string().min(5, 'informe a justificativa'),
});

// UC05 — a Unidade solicita manutenção
manutencoesRouter.post(
  '/',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_MANUTENCAO),
  validarBody(solicitarSchema),
  async (req, res) => {
    const manutencao = await service.solicitar(req.usuario!, req.body);
    res.status(201).json(manutencao);
  },
);

// RN03 — somente o Gestor de Manutenção decide
manutencoesRouter.post(
  '/:id/aprovar',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(z.object({ contratoId: z.string().uuid().optional() })),
  async (req, res) => {
    res.json(await service.aprovar(req.usuario!, req.params.id, req.body.contratoId));
  },
);

manutencoesRouter.post(
  '/:id/negar',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(z.object({ motivo: z.string().min(3, 'informe o motivo da negação') })),
  async (req, res) => {
    res.json(await service.negar(req.usuario!, req.params.id, req.body.motivo));
  },
);

manutencoesRouter.post(
  '/:id/orcamento',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(
    z.object({
      valor: z.number().positive('o valor do orçamento deve ser positivo'),
      descricao: z.string().optional(),
      contratoId: z.string().uuid().optional(),
    }),
  ),
  async (req, res) => {
    res.json(await service.registrarOrcamento(req.usuario!, req.params.id, req.body));
  },
);

manutencoesRouter.post(
  '/:id/validar-orcamento',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(
    z.object({
      aprovado: z.boolean(),
      laudoBaixa: z.string().min(5).optional(),
    }),
  ),
  async (req, res) => {
    res.json(await service.validarOrcamento(req.usuario!, req.params.id, req.body));
  },
);

manutencoesRouter.post(
  '/:id/baixa',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(z.object({ laudo: z.string().min(5, 'informe o laudo técnico da baixa') })),
  async (req, res) => {
    res.json(await service.emitirBaixa(req.usuario!, req.params.id, req.body.laudo));
  },
);

manutencoesRouter.post(
  '/:id/registrar-retorno',
  permitir(Perfil.GESTOR_MANUTENCAO),
  validarBody(z.object({ custoFinal: z.number().nonnegative().optional() })),
  async (req, res) => {
    res.json(await service.registrarRetorno(req.usuario!, req.params.id, req.body.custoFinal));
  },
);

// RN11 — confirmação dupla (Unidade + Gestor de Manutenção)
manutencoesRouter.post(
  '/:id/confirmar-retorno',
  permitir(Perfil.UNIDADE, Perfil.GESTOR_MANUTENCAO),
  validarBody(z.object({ estadoPosManutencao: z.nativeEnum(EstadoConservacao).optional() })),
  async (req, res) => {
    res.json(
      await service.confirmarRetorno(req.usuario!, req.params.id, req.body.estadoPosManutencao),
    );
  },
);
