import { Router } from 'express';
import { z } from 'zod';
import { Perfil, Prisma, StatusContrato } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { comprometidoPorItem, saldoDoItem } from './saldo';

// Contratos de manutenção, garantia e serviços (Configurações do Sistema)
export const contratosRouter = Router();

contratosRouter.use(autenticar);
// A terceirizada só consulta (GET) os contratos do próprio prestador; criar, editar e excluir é do Administrador
contratosRouter.use((req, res, next) =>
  req.method === 'GET'
    ? permitir(Perfil.OPERADOR, Perfil.TERCEIRIZADA)(req, res, next)
    : permitir(Perfil.OPERADOR)(req, res, next),
);

const selecaoItens = {
  orderBy: { criadoEm: 'asc' },
  select: {
    id: true,
    servicoId: true,
    valor: true,
    escopoId: true,
    servico: { select: { id: true, nome: true } },
    escopo: { select: { id: true, nome: true, cobrePreventiva: true, cobreCorretiva: true } },
  },
} satisfies Prisma.Contrato$itensArgs;

contratosRouter.get('/', async (req, res) => {
  if (req.usuario!.perfil === Perfil.TERCEIRIZADA && !req.usuario!.prestadorId) {
    res.json([]);
    return;
  }
  const busca = typeof req.query.busca === 'string' ? req.query.busca : undefined;
  const buscaGestor: Prisma.ContratoWhereInput | undefined = busca
    ? {
        OR: [
          { numero: { contains: busca, mode: 'insensitive' } },
          { prestador: { nome: { contains: busca, mode: 'insensitive' } } },
          { itens: { some: { servico: { nome: { contains: busca, mode: 'insensitive' } } } } },
        ],
      }
    : undefined;
  // Terceirizada: só os contratos do próprio prestador (vem do token), buscando apenas pelo número
  const where: Prisma.ContratoWhereInput | undefined =
    req.usuario!.perfil === Perfil.TERCEIRIZADA
      ? {
          prestadorId: req.usuario!.prestadorId as string,
          ...(busca ? { numero: { contains: busca, mode: 'insensitive' } } : {}),
        }
      : buscaGestor;
  const contratos = await prisma.contrato.findMany({
    where,
    orderBy: { numero: 'asc' },
    include: { prestador: { select: { id: true, nome: true } }, itens: selecaoItens },
  });
  const comprometido = await comprometidoPorItem(
    prisma,
    contratos.flatMap((c) => c.itens.map((i) => i.id)),
  );
  res.json(
    contratos.map((c) => ({
      ...c,
      itens: c.itens.map((i) => ({ ...i, saldo: saldoDoItem(i.valor, comprometido.get(i.id) ?? 0) })),
    })),
  );
});

const itemSchema = z.object({
  servicoId: z.string().uuid(),
  valor: z.number().nonnegative().max(999_999_999_999.99),
  escopoId: z.string().uuid(),
});

const listaItens = z.array(itemSchema).max(200);
const semRepetidos = (itens: Array<{ servicoId: string }>) =>
  new Set(itens.map((i) => i.servicoId)).size === itens.length;
const MSG_REPETIDO = { message: 'o mesmo serviço não pode aparecer duas vezes no contrato' };

// O valor total não é informado: o servidor o calcula somando os itens.
const contratoSchema = z.object({
  numero: z.string().min(1),
  prestadorId: z.string().uuid(),
  objeto: z.string().min(2),
  status: z.nativeEnum(StatusContrato).default('ATIVO'),
  vigenciaInicio: z.coerce.date(),
  vigenciaFim: z.coerce.date(),
  itens: listaItens.min(1, 'informe ao menos um item').refine(semRepetidos, MSG_REPETIDO),
});

type ItemEntrada = z.infer<typeof itemSchema>;

// Soma em centavos para não acumular erro de ponto flutuante.
function somarItens(itens: ItemEntrada[]) {
  return itens.reduce((total, i) => total + Math.round(i.valor * 100), 0) / 100;
}

function dadosItens(itens: ItemEntrada[]) {
  return itens.map((i) => ({
    servicoId: i.servicoId,
    valor: Math.round(i.valor * 100) / 100,
    escopoId: i.escopoId,
  }));
}

// Prestador, serviços e escopos precisam existir.
async function validarReferencias(tx: Prisma.TransactionClient, prestadorId: string | undefined, itens: ItemEntrada[]) {
  if (prestadorId && !(await tx.prestadorServico.findUnique({ where: { id: prestadorId }, select: { id: true } }))) {
    throw new AppError('Prestador de serviço não encontrado.', 422);
  }
  if (itens.length === 0) return;
  const ids = itens.map((i) => i.servicoId);
  const encontrados = await tx.servicoContrato.count({ where: { id: { in: ids } } });
  if (encontrados !== ids.length) throw new AppError('Um ou mais serviços informados não existem.', 422);
  const escopos = [...new Set(itens.map((i) => i.escopoId))];
  if ((await tx.escopoServico.count({ where: { id: { in: escopos } } })) !== escopos.length) {
    throw new AppError('Um ou mais escopos informados não existem.', 422);
  }
}

contratosRouter.post('/', validarBody(contratoSchema), async (req, res) => {
  const { itens, ...dados } = req.body as z.infer<typeof contratoSchema>;
  const existe = await prisma.contrato.findUnique({ where: { numero: dados.numero } });
  if (existe) throw new AppError('Já existe contrato com este número.', 409);
  const contrato = await prisma.$transaction(async (tx) => {
    await validarReferencias(tx, dados.prestadorId, itens);
    const criado = await tx.contrato.create({
      data: { ...dados, valorTotal: somarItens(itens), itens: { create: dadosItens(itens) } },
      include: { prestador: { select: { id: true, nome: true } }, itens: selecaoItens },
    });
    await registrarAuditoria(
      {
        usuarioId: req.usuario!.sub,
        acao: 'CADASTRAR_CONTRATO',
        entidade: 'contrato',
        entidadeId: criado.id,
        dadosDepois: { numero: criado.numero, prestadorId: criado.prestadorId, itens: itens.length, valorTotal: criado.valorTotal },
      },
      tx,
    );
    return criado;
  });
  res.status(201).json(contrato);
});

contratosRouter.patch(
  '/:id',
  validarBody(
    contratoSchema.partial().extend({
      ativo: z.boolean().optional(),
      // No PATCH a lista pode vir vazia: só é aceita em contrato antigo, que ainda não tinha itens.
      itens: listaItens.refine(semRepetidos, MSG_REPETIDO).optional(),
    }),
  ),
  async (req, res) => {
    const { itens, ...dados } = req.body as Partial<z.infer<typeof contratoSchema>> & {
      ativo?: boolean;
      itens?: ItemEntrada[];
    };
    const antes = await prisma.contrato.findUnique({
      where: { id: req.params.id },
      include: { itens: { select: { id: true, servicoId: true, escopoId: true } } },
    });
    if (!antes) throw new AppError('Contrato não encontrado.', 404);
    if (dados.numero && dados.numero !== antes.numero) {
      const duplicado = await prisma.contrato.findUnique({ where: { numero: dados.numero } });
      if (duplicado) throw new AppError('Já existe contrato com este número.', 409);
    }
    if (itens && itens.length === 0 && antes.itens.length > 0) {
      throw new AppError('O contrato precisa ter ao menos um item.', 422);
    }

    const contrato = await prisma.$transaction(async (tx) => {
      if (dados.prestadorId && dados.prestadorId !== antes.prestadorId) {
        const ligadas = await tx.manutencao.count({ where: { contratoId: antes.id } });
        if (ligadas > 0) {
          throw new AppError(
            'Não é possível trocar o prestador: o contrato já tem manutenções vinculadas.',
            422,
          );
        }
      }
      // Lista vazia em contrato legado: mantém o valor total que já existia.
      const substituir = itens !== undefined && itens.length > 0;
      await validarReferencias(tx, dados.prestadorId, substituir ? itens : []);
      if (substituir) {
        // Itens mantidos são atualizados no lugar (manutenções podem apontar para eles); só saem os removidos
        const novos = new Map(dadosItens(itens).map((i) => [i.servicoId, i]));
        const removidos = antes.itens.filter((i) => !novos.has(i.servicoId));
        if (removidos.length > 0) {
          const emUso = await tx.manutencao.count({ where: { contratoItemId: { in: removidos.map((i) => i.id) } } });
          if (emUso > 0) {
            throw new AppError('Um item removido está vinculado a manutenções e não pode ser excluído do contrato.', 422);
          }
          await tx.contratoItem.deleteMany({ where: { id: { in: removidos.map((i) => i.id) } } });
        }
        const existentes = new Map(antes.itens.map((i) => [i.servicoId, i.id]));
        // O valor de um item nunca pode ficar abaixo do que as manutenções vinculadas já comprometeram
        // Trava os itens mantidos: uma aprovação ou um orçamento simultâneo não pode gastar saldo entre a conferência e a gravação
        const idsMantidos = [...existentes.values()];
        if (idsMantidos.length > 0) {
          await tx.$queryRaw`SELECT id FROM contrato_item WHERE id IN (${Prisma.join(idsMantidos)}) FOR UPDATE`;
        }
        const comprometido = await comprometidoPorItem(tx, idsMantidos);
        for (const item of novos.values()) {
          const id = existentes.get(item.servicoId);
          const gasto = id ? (comprometido.get(id) ?? 0) : 0;
          if (id && item.valor < gasto) {
            throw new AppError(
              `O valor do item não pode ser menor que o já comprometido por manutenções (${gasto.toFixed(2)}).`,
              422,
            );
          }
        }
        for (const item of novos.values()) {
          const id = existentes.get(item.servicoId);
          const anterior = antes.itens.find((i) => i.servicoId === item.servicoId);
          if (id && anterior && item.escopoId !== anterior.escopoId) {
            const ligadas = await tx.manutencao.count({ where: { contratoItemId: id } });
            if (ligadas > 0) {
              throw new AppError(
                'Não é possível alterar o escopo de um item vinculado a manutenções.',
                422,
              );
            }
          }
          if (id) await tx.contratoItem.update({ where: { id }, data: { valor: item.valor, escopoId: item.escopoId } });
          else await tx.contratoItem.create({ data: { ...item, contratoId: antes.id } });
        }
      }
      const atualizado = await tx.contrato.update({
        where: { id: antes.id },
        data: { ...dados, ...(substituir ? { valorTotal: somarItens(itens) } : {}) },
        include: { prestador: { select: { id: true, nome: true } }, itens: selecaoItens },
      });
      await registrarAuditoria(
        {
          usuarioId: req.usuario!.sub,
          acao: 'ATUALIZAR_CONTRATO',
          entidade: 'contrato',
          entidadeId: atualizado.id,
          dadosAntes: {
            numero: antes.numero,
            status: antes.status,
            itens: antes.itens.length,
            valorTotal: antes.valorTotal,
          },
          dadosDepois: { ...dados, itens: atualizado.itens.length, valorTotal: atualizado.valorTotal },
        },
        tx,
      );
      return atualizado;
    });
    res.json(contrato);
  },
);

contratosRouter.delete('/:id', permitir(Perfil.OPERADOR), async (req, res) => {
  const contrato = await prisma.contrato.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { manutencoes: true } } },
  });
  if (!contrato) throw new AppError('Contrato não encontrado.', 404);
  if (contrato._count.manutencoes > 0) {
    throw new AppError(
      'O contrato possui manutenções vinculadas e não pode ser excluído. Marque-o como expirado.',
      422,
    );
  }
  await prisma.contrato.delete({ where: { id: req.params.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_CONTRATO',
    entidade: 'contrato',
    entidadeId: contrato.id,
    dadosAntes: { numero: contrato.numero, prestadorId: contrato.prestadorId },
  });
  res.status(204).end();
});
