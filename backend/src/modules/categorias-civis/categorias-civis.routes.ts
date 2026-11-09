import { Router } from 'express';
import { z } from 'zod';
import { Perfil, Prisma, TipoPergunta } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// Categorias do chamado civil (ex.: Hidráulica, Elétrica) e as perguntas que o solicitante responde ao abrir cada uma.
// O cadastro é feito em Configurações; quem abre o chamado só lê as categorias e perguntas ativas.
export const categoriasCivisRouter = Router();

categoriasCivisRouter.use(autenticar);

const selecao = {
  id: true,
  nome: true,
  ativo: true,
  ordem: true,
  perguntas: {
    orderBy: { ordem: 'asc' },
    select: { id: true, texto: true, tipo: true, opcoes: true, obrigatoria: true, ordem: true, ativo: true },
  },
  _count: { select: { manutencoes: true } },
} satisfies Prisma.CategoriaCivilSelect;

const perguntaSchema = z
  .object({
    id: z.string().uuid().optional(),
    texto: z.string().trim().min(3, 'informe o texto da pergunta').max(200),
    tipo: z.nativeEnum(TipoPergunta),
    opcoes: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    obrigatoria: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === 'OPCOES' && new Set(p.opcoes).size < 2) {
      ctx.addIssue({ code: 'custom', message: `"${p.texto}": informe ao menos duas opções diferentes`, path: ['opcoes'] });
    }
  });

const categoriaSchema = z.object({
  nome: z.string().trim().min(2, 'informe o nome da categoria').max(60),
  ativo: z.boolean().optional(),
  perguntas: z.array(perguntaSchema).max(30, 'No máximo 30 perguntas por categoria.').optional(),
});

// Lista: quem só abre chamados vê as categorias ativas e suas perguntas ativas; quem cadastra vê tudo
categoriasCivisRouter.get(
  '/',
  permitirCom(['CONFIGURACOES_GERENCIAR', 'MANUTENCAO_ESCREVER', 'MANUTENCAO_AVALIAR', 'MANUTENCAO_TRIAR', 'MANUTENCAO_CONSULTAR'], Perfil.UNIDADE),
  async (req, res) => {
    const cadastra = req.usuario!.permissoes.includes('CONFIGURACOES_GERENCIAR');
    const todas = cadastra && req.query.todas === 'true';
    const categorias = await prisma.categoriaCivil.findMany({
      where: todas ? {} : { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: selecao,
      take: 200,
    });
    res.json(todas ? categorias : categorias.map((c) => ({ ...c, perguntas: c.perguntas.filter((p) => p.ativo) })));
  },
);

// Grava a lista de perguntas: as com id são atualizadas, as sem id nascem e as que sumiram da lista ficam inativas
// (respostas já dadas continuam apontando para elas). A posição na lista define a ordem.
async function gravarPerguntas(tx: Prisma.TransactionClient, categoriaId: string, perguntas: z.infer<typeof perguntaSchema>[]) {
  const existentes = await tx.perguntaCategoria.findMany({ where: { categoriaId }, select: { id: true } });
  const ids = new Set(existentes.map((p) => p.id));
  for (const p of perguntas) {
    if (p.id && !ids.has(p.id)) throw new AppError('Pergunta não pertence a esta categoria.', 422);
  }
  const mantidas = new Set(perguntas.flatMap((p) => (p.id ? [p.id] : [])));
  await tx.perguntaCategoria.updateMany({
    where: { categoriaId, id: { notIn: [...mantidas] } },
    data: { ativo: false },
  });
  for (const [ordem, p] of perguntas.entries()) {
    const dados = {
      texto: p.texto,
      tipo: p.tipo,
      opcoes: p.tipo === 'OPCOES' ? [...new Set(p.opcoes)] : [],
      obrigatoria: p.obrigatoria,
      ordem,
      ativo: true,
    };
    if (p.id) await tx.perguntaCategoria.update({ where: { id: p.id }, data: dados });
    else await tx.perguntaCategoria.create({ data: { ...dados, categoriaId } });
  }
}

async function exigirNomeLivre(nome: string, ignorarId?: string) {
  const igual = await prisma.categoriaCivil.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } }, select: { id: true } });
  if (igual && igual.id !== ignorarId) throw new AppError('Já existe uma categoria com este nome.', 409);
}

categoriasCivisRouter.post('/', permitirCom('CONFIGURACOES_GERENCIAR'), validarBody(categoriaSchema), async (req, res) => {
  const { perguntas = [], ...dados } = req.body as z.infer<typeof categoriaSchema>;
  await exigirNomeLivre(dados.nome);
  const criada = await prisma.$transaction(async (tx) => {
    const ultima = await tx.categoriaCivil.aggregate({ _max: { ordem: true } });
    const c = await tx.categoriaCivil.create({ data: { ...dados, ordem: (ultima._max.ordem ?? 0) + 1 } });
    await gravarPerguntas(tx, c.id, perguntas);
    await registrarAuditoria(
      { usuarioId: req.usuario!.sub, acao: 'CADASTRAR_CATEGORIA_CIVIL', entidade: 'categoria_civil', entidadeId: c.id, dadosDepois: { nome: c.nome, perguntas: perguntas.length } },
      tx,
    );
    return tx.categoriaCivil.findUniqueOrThrow({ where: { id: c.id }, select: selecao });
  });
  res.status(201).json(criada);
});

categoriasCivisRouter.patch('/:id', permitirCom('CONFIGURACOES_GERENCIAR'), validarBody(categoriaSchema.partial()), async (req, res) => {
  const { perguntas, ...dados } = req.body as Partial<z.infer<typeof categoriaSchema>>;
  const antes = await prisma.categoriaCivil.findUnique({ where: { id: req.params.id }, select: { id: true, nome: true, ativo: true } });
  if (!antes) throw new AppError('Categoria não encontrada.', 404);
  if (dados.nome) await exigirNomeLivre(dados.nome, antes.id);
  const atualizada = await prisma.$transaction(async (tx) => {
    if (Object.keys(dados).length > 0) await tx.categoriaCivil.update({ where: { id: antes.id }, data: dados });
    if (perguntas) await gravarPerguntas(tx, antes.id, perguntas);
    await registrarAuditoria(
      {
        usuarioId: req.usuario!.sub,
        acao: 'ATUALIZAR_CATEGORIA_CIVIL',
        entidade: 'categoria_civil',
        entidadeId: antes.id,
        dadosAntes: { nome: antes.nome, ativo: antes.ativo },
        dadosDepois: { ...dados, ...(perguntas ? { perguntas: perguntas.length } : {}) },
      },
      tx,
    );
    return tx.categoriaCivil.findUniqueOrThrow({ where: { id: antes.id }, select: selecao });
  });
  res.json(atualizada);
});

categoriasCivisRouter.delete('/:id', permitirCom('CONFIGURACOES_GERENCIAR'), async (req, res) => {
  const categoria = await prisma.categoriaCivil.findUnique({
    where: { id: req.params.id },
    select: { id: true, nome: true, _count: { select: { manutencoes: true } } },
  });
  if (!categoria) throw new AppError('Categoria não encontrada.', 404);
  if (categoria._count.manutencoes > 0) {
    throw new AppError('A categoria está em chamados e não pode ser excluída. Desative-a.', 422);
  }
  await prisma.categoriaCivil.delete({ where: { id: categoria.id } });
  await registrarAuditoria({
    usuarioId: req.usuario!.sub,
    acao: 'EXCLUIR_CATEGORIA_CIVIL',
    entidade: 'categoria_civil',
    entidadeId: categoria.id,
    dadosAntes: { nome: categoria.nome },
  });
  res.status(204).end();
});
