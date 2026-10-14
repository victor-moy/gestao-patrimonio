import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';

// Tabela de referência SINAPI usada para precificar serviços e materiais do chamado civil.
// Consulta para quem monta ou aprova o orçamento; o cadastro dos itens ainda é feito por seed/importação.
export const sinapiRouter = Router();

sinapiRouter.use(autenticar);

const LIMITE = 50;

sinapiRouter.get('/', permitir(Perfil.OPERADOR, Perfil.TERCEIRIZADA), async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, 80) : '';
  const itens = await prisma.itemSinapi.findMany({
    where: {
      ativo: true,
      ...(busca
        ? { OR: [{ codigo: { contains: busca, mode: 'insensitive' } }, { descricao: { contains: busca, mode: 'insensitive' } }] }
        : {}),
    },
    orderBy: { descricao: 'asc' },
    take: LIMITE,
  });
  res.json(itens);
});
