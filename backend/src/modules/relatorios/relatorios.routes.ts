import { Router } from 'express';
import { Perfil, TipoSolicitacao } from '@prisma/client';
import { AppError } from '../../errors/AppError';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import * as service from './relatorios.service';

export const relatoriosRouter = Router();

// Relatórios sobre Solicitações — exclusivos do Gestor de Patrimônio, que é
// quem decide todos os 5 tipos (RN04); diferente do /dashboard (equipamento/
// manutenção), que também é usado pelo Gestor de Manutenção.
relatoriosRouter.use(autenticar, permitir(Perfil.GESTOR_PATRIMONIO));

function periodo(req: import('express').Request) {
  return {
    dataInicio: req.query.dataInicio ? new Date(String(req.query.dataInicio)) : undefined,
    dataFim: req.query.dataFim ? new Date(String(req.query.dataFim)) : undefined,
  };
}

relatoriosRouter.get('/visao-geral', async (req, res) => {
  res.json(
    await service.visaoGeral({
      ...periodo(req),
      unidadeId: req.query.unidadeId as string | undefined,
    }),
  );
});

relatoriosRouter.get('/ranking-unidades', async (req, res) => {
  const tipo = req.query.tipo as TipoSolicitacao | undefined;
  if (!tipo) {
    throw new AppError('Informe o tipo de solicitação.', 422);
  }
  res.json(await service.rankingUnidades({ ...periodo(req), tipo }));
});

relatoriosRouter.get('/emprestimos', async (req, res) => {
  res.json(
    await service.emprestimos({
      ...periodo(req),
      unidadeId: req.query.unidadeId as string | undefined,
    }),
  );
});

relatoriosRouter.get('/cessoes', async (req, res) => {
  res.json(await service.cessoes(periodo(req)));
});
