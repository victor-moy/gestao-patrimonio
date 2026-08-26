import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { uploadLaudoPdf } from '../../lib/uploads';
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

// Aceita boolean (JSON) ou 'true'/'false' (campo de texto vindo de multipart/form-data)
const booleanFlexivel = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');

// Laudo de baixa (RF16) é um upload de PDF — só é exigido quando aprovado=false
manutencoesRouter.post(
  '/:id/validar-orcamento',
  permitir(Perfil.GESTOR_MANUTENCAO),
  uploadLaudoPdf.single('laudo'),
  validarBody(z.object({ aprovado: booleanFlexivel })),
  async (req, res) => {
    const laudoUrl = req.file ? `/uploads/laudos/${req.file.filename}` : undefined;
    res.json(
      await service.validarOrcamento(req.usuario!, req.params.id, {
        aprovado: req.body.aprovado,
        laudoBaixa: laudoUrl,
      }),
    );
  },
);

manutencoesRouter.post(
  '/:id/baixa',
  permitir(Perfil.GESTOR_MANUTENCAO),
  uploadLaudoPdf.single('laudo'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('Envie o laudo técnico da baixa em PDF no campo "laudo".', 422);
    }
    const laudoUrl = `/uploads/laudos/${req.file.filename}`;
    res.json(await service.emitirBaixa(req.usuario!, req.params.id, laudoUrl));
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
