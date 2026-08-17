import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, MotivoBaixa, Perfil, StatusEquipamento } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import * as service from './equipamentos.service';

export const equipamentosRouter = Router();

equipamentosRouter.use(autenticar);

equipamentosRouter.get('/', async (req, res) => {
  const equipamentos = await service.listar(req.usuario!, {
    unidadeId: req.query.unidadeId as string | undefined,
    tipoEquipamentoId: req.query.tipoEquipamentoId as string | undefined,
    categoriaId: req.query.categoriaId as string | undefined,
    estadoConservacao: req.query.estadoConservacao as EstadoConservacao | undefined,
    status: req.query.status as StatusEquipamento | undefined,
    busca: req.query.busca as string | undefined,
  });
  res.json(equipamentos);
});

equipamentosRouter.get('/:id', async (req, res) => {
  const equipamento = await service.buscarPorId(req.usuario!, req.params.id);
  res.json(equipamento);
});

const cadastroSchema = z.object({
  tombamento: z.string().min(1, 'informe o número de tombamento'),
  descricao: z.string().min(2),
  tipoEquipamentoId: z.string().uuid(),
  unidadeId: z.string().uuid(),
  estadoConservacao: z.nativeEnum(EstadoConservacao),
  emendaParlamentar: z.boolean().default(false),
  dataAquisicao: z.coerce.date().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

// UC02 — cadastro manual pelo Galpão (o Gestor de Patrimônio também pode)
equipamentosRouter.post(
  '/',
  permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO),
  validarBody(cadastroSchema),
  async (req, res) => {
    const equipamento = await service.cadastrar(req.usuario!.sub, req.body);
    res.status(201).json(equipamento);
  },
);

const atualizacaoSchema = z.object({
  descricao: z.string().min(2).optional(),
  estadoConservacao: z.nativeEnum(EstadoConservacao).optional(),
  observacoes: z.string().nullable().optional(),
  emendaParlamentar: z.boolean().optional(),
});

equipamentosRouter.patch(
  '/:id',
  permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO),
  validarBody(atualizacaoSchema),
  async (req, res) => {
    const equipamento = await service.atualizar(req.usuario!.sub, req.params.id, req.body);
    res.json(equipamento);
  },
);

// Baixa manual (leilão, extravio, roubo...)
equipamentosRouter.post(
  '/:id/baixa',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      motivo: z.nativeEnum(MotivoBaixa),
      observacao: z.string().min(2).optional(),
    }),
  ),
  async (req, res) => {
    const equipamento = await service.darBaixa(req.usuario!.sub, req.params.id, req.body);
    res.json(equipamento);
  },
);
