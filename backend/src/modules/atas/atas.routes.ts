import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// UC19/UC20/RF33-35 — controle de atas de registro de preços
export const atasRouter = Router();

atasRouter.use(autenticar, permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GESTOR_MANUTENCAO, Perfil.GALPAO));

atasRouter.get('/', async (_req, res) => {
  const atas = await prisma.ata.findMany({
    include: {
      unidadeEspecifica: { select: { id: true, nome: true } },
      solicitacoes: {
        select: { id: true, status: true, valorVinculado: true, criadoEm: true },
      },
    },
    orderBy: { vencimento: 'asc' },
  });
  res.json(atas);
});

// RF35 — alertas: vencimento em até 30 dias ou saldo < 10% do total
atasRouter.get('/alertas', async (_req, res) => {
  const atas = await prisma.ata.findMany({ where: { ativo: true } });
  const agora = new Date();
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alertas = atas.flatMap((ata) => {
    const lista: Array<{ ataId: string; numero: string; tipo: string; mensagem: string }> = [];
    if (ata.vencimento <= em30dias && ata.vencimento >= agora) {
      const dias = Math.ceil((ata.vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
      lista.push({
        ataId: ata.id,
        numero: ata.numero,
        tipo: 'VENCIMENTO',
        mensagem: `Ata ${ata.numero} vence em ${dias} dia${dias === 1 ? '' : 's'} — saldo restante: R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      });
    }
    if (ata.vencimento < agora) {
      lista.push({
        ataId: ata.id,
        numero: ata.numero,
        tipo: 'VENCIDA',
        mensagem: `Ata ${ata.numero} está vencida`,
      });
    }
    const percentual = Number(ata.valorTotal) > 0 ? (Number(ata.saldo) / Number(ata.valorTotal)) * 100 : 0;
    if (percentual < 10) {
      lista.push({
        ataId: ata.id,
        numero: ata.numero,
        tipo: 'SALDO_BAIXO',
        mensagem: `Ata ${ata.numero} com saldo baixo — apenas ${percentual.toFixed(1)}% do valor disponível (R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      });
    }
    return lista;
  });
  res.json(alertas);
});

const ataSchema = z.object({
  numero: z.string().min(1),
  fornecedor: z.string().min(2, 'informe o fornecedor'),
  descricao: z.string().min(2),
  valorTotal: z.number().positive(),
  saldo: z.number().nonnegative().optional(),
  vencimento: z.coerce.date(),
  unidadeEspecificaId: z.string().uuid().nullable().optional(),
});

atasRouter.post(
  '/',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(ataSchema),
  async (req, res) => {
    const existe = await prisma.ata.findUnique({ where: { numero: req.body.numero } });
    if (existe) throw new AppError('Já existe ata com este número.', 409);
    const ata = await prisma.ata.create({
      data: {
        numero: req.body.numero,
        fornecedor: req.body.fornecedor,
        descricao: req.body.descricao,
        valorTotal: req.body.valorTotal,
        saldo: req.body.saldo ?? req.body.valorTotal,
        vencimento: req.body.vencimento,
        unidadeEspecificaId: req.body.unidadeEspecificaId ?? null,
      },
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'CADASTRAR_ATA',
      entidade: 'ata',
      entidadeId: ata.id,
      dadosDepois: { numero: ata.numero, valorTotal: ata.valorTotal, vencimento: ata.vencimento },
    });
    res.status(201).json(ata);
  },
);

atasRouter.patch(
  '/:id',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(
    z.object({
      fornecedor: z.string().min(2).optional(),
      descricao: z.string().min(2).optional(),
      valorTotal: z.number().positive().optional(),
      saldo: z.number().nonnegative().optional(),
      vencimento: z.coerce.date().optional(),
      unidadeEspecificaId: z.string().uuid().nullable().optional(),
      ativo: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const antes = await prisma.ata.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Ata não encontrada.', 404);
    const ata = await prisma.ata.update({ where: { id: req.params.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_ATA',
      entidade: 'ata',
      entidadeId: ata.id,
      dadosAntes: { saldo: antes.saldo, vencimento: antes.vencimento, ativo: antes.ativo },
      dadosDepois: req.body,
    });
    res.json(ata);
  },
);
