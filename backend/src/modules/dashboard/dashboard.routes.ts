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

// Pendências e riscos da Home — todos os perfis autenticados (escopo pelo token)
dashboardRouter.get(
  '/alertas',
  // SEM_ACESSO também: a Home dele existe, mas o serviço devolve a lista vazia
  permitir(Perfil.OPERADOR, Perfil.UNIDADE, Perfil.GALPAO, Perfil.TERCEIRIZADA, Perfil.SEM_ACESSO),
  async (req, res) => {
    res.json(await service.alertas(req.usuario!));
  },
);
