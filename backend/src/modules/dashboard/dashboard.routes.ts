import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import * as service from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.use(autenticar);

dashboardRouter.get(
  '/alertas',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GESTOR_MANUTENCAO),
  async (_req, res) => {
    res.json(await service.alertas());
  },
);
