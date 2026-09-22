import { Router } from 'express';
import { Perfil } from '@prisma/client';
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

// Filtro de unidade aceita múltiplas seleções (multiselect no frontend),
// enviadas como lista separada por vírgula num único query param.
function unidadeIds(req: import('express').Request): string[] | undefined {
  const bruto = req.query.unidadeId as string | undefined;
  if (!bruto) return undefined;
  const ids = bruto.split(',').filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

relatoriosRouter.get('/visao-geral', async (req, res) => {
  res.json(
    await service.visaoGeral({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
    }),
  );
});

relatoriosRouter.get('/ranking-unidades', async (req, res) => {
  res.json(
    await service.rankingUnidades({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
    }),
  );
});

relatoriosRouter.get('/emprestimos', async (req, res) => {
  res.json(
    await service.emprestimos({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
    }),
  );
});

relatoriosRouter.get('/cessoes', async (req, res) => {
  res.json(await service.cessoes(periodo(req)));
});

relatoriosRouter.get('/itens-estoque', async (_req, res) => {
  res.json(await service.itensEstoque());
});
