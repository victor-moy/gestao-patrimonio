import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import * as service from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.use(autenticar);

// RF36 — dashboard do Administrador
dashboardRouter.get(
  '/',
  permitir(Perfil.OPERADOR),
  async (req, res) => {
    const dados = await service.indicadores({
      dataInicio: req.query.dataInicio ? new Date(String(req.query.dataInicio)) : undefined,
      dataFim: req.query.dataFim ? new Date(String(req.query.dataFim)) : undefined,
      unidadeId: req.query.unidadeId as string | undefined,
      tipoEquipamentoId: req.query.tipoEquipamentoId as string | undefined,
    });
    res.json(dados);
  },
);

dashboardRouter.get(
  '/alertas',
  permitir(Perfil.OPERADOR),
  async (_req, res) => {
    res.json(await service.alertas());
  },
);
