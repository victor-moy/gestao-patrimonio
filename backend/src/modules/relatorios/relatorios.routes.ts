import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { AppError } from '../../errors/AppError';
import * as service from './relatorios.service';

export const relatoriosRouter = Router();

// Relatórios (solicitações e manutenções) — exclusivos do Administrador, que é
// quem decide todos os 5 tipos (RN04); diferente do /dashboard (equipamento/
// manutenção), que também é usado pelo Administrador.
relatoriosRouter.use(autenticar, permitir(Perfil.OPERADOR));

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

// Filtro de item — seleção única (combobox), diferente do multiselect de unidade.
function tipoEquipamentoId(req: import('express').Request): string | undefined {
  return (req.query.tipoEquipamentoId as string | undefined) || undefined;
}

function busca(req: import('express').Request): string | undefined {
  return (req.query.busca as string | undefined) || undefined;
}

relatoriosRouter.get('/visao-geral', async (req, res) => {
  res.json(
    await service.visaoGeral({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
      tipoEquipamentoId: tipoEquipamentoId(req),
    }),
  );
});

relatoriosRouter.get('/ranking-unidades', async (req, res) => {
  res.json(
    await service.rankingUnidades({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
      tipoEquipamentoId: tipoEquipamentoId(req),
    }),
  );
});

relatoriosRouter.get('/emprestimos', async (req, res) => {
  res.json(
    await service.emprestimos({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
      tipoEquipamentoId: tipoEquipamentoId(req),
      busca: busca(req),
    }),
  );
});

relatoriosRouter.get('/cessoes', async (req, res) => {
  res.json(
    await service.cessoes({
      ...periodo(req),
      unidadeIds: unidadeIds(req),
      tipoEquipamentoId: tipoEquipamentoId(req),
      busca: busca(req),
    }),
  );
});

const SITUACOES = ['EM_ANDAMENTO', 'CONCLUIDA', 'NEGADA', 'BAIXADO'] as const;

relatoriosRouter.get('/manutencoes', async (req, res) => {
  const situacao = req.query.situacao as string | undefined;
  if (situacao && !(SITUACOES as readonly string[]).includes(situacao)) {
    throw new AppError('Situação inválida.', 422);
  }
  const datas = periodo(req);
  for (const d of [datas.dataInicio, datas.dataFim]) {
    if (d && Number.isNaN(d.getTime())) throw new AppError('Data inválida.', 422);
  }
  res.json(
    await service.manutencoes({
      ...datas,
      unidadeIds: unidadeIds(req),
      tipoEquipamentoId: tipoEquipamentoId(req),
      prestadorId: (req.query.prestadorId as string | undefined) || undefined,
      situacao: situacao as service.SituacaoManutencao | undefined,
      busca: busca(req),
    }),
  );
});

relatoriosRouter.get('/itens-estoque', async (_req, res) => {
  res.json(await service.itensEstoque());
});

relatoriosRouter.get('/resumo-item', async (req, res) => {
  res.json(await service.resumoItem(tipoEquipamentoId(req), periodo(req)));
});
