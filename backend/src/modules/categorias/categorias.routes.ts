import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { uploadImagemTipo, removerImagemTipo } from '../../lib/uploads';

// Taxonomia de grupos/subgrupos espelhando o e-Pública
// (feedback da reunião de 12/05/2026).
export const categoriasRouter = Router();

categoriasRouter.use(autenticar);

categoriasRouter.get('/', async (_req, res) => {
  const categorias = await prisma.categoria.findMany({
    include: { tipos: { orderBy: { nome: 'asc' } } },
    orderBy: { nome: 'asc' },
  });
  res.json(categorias);
});

// Tipos com contagem de equipamentos (tela de Configurações)
categoriasRouter.get('/tipos', async (_req, res) => {
  const tipos = await prisma.tipoEquipamento.findMany({
    include: {
      categoria: { select: { nome: true } },
      _count: { select: { equipamentos: true } },
    },
    orderBy: { nome: 'asc' },
  });
  res.json(
    tipos.map(({ _count, ...tipo }) => ({ ...tipo, quantidadeEquipamentos: _count.equipamentos })),
  );
});

const categoriaSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().nullable().optional(),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'informe a cor no formato #rrggbb')
    .nullable()
    .optional(),
});

categoriasRouter.post(
  '/',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  validarBody(categoriaSchema),
  async (req, res) => {
    const existe = await prisma.categoria.findUnique({ where: { nome: req.body.nome } });
    if (existe) throw new AppError('Já existe categoria com este nome.', 409);
    const categoria = await prisma.categoria.create({ data: req.body });
    res.status(201).json(categoria);
  },
);

categoriasRouter.patch(
  '/:id',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  validarBody(categoriaSchema.partial()),
  async (req, res) => {
    const antes = await prisma.categoria.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Categoria não encontrada.', 404);
    if (req.body.nome && req.body.nome !== antes.nome) {
      const duplicada = await prisma.categoria.findUnique({ where: { nome: req.body.nome } });
      if (duplicada) throw new AppError('Já existe categoria com este nome.', 409);
    }
    const categoria = await prisma.categoria.update({ where: { id: req.params.id }, data: req.body });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_CATEGORIA',
      entidade: 'categoria',
      entidadeId: categoria.id,
      dadosAntes: antes,
      dadosDepois: req.body,
    });
    res.json(categoria);
  },
);

categoriasRouter.delete(
  '/:id',
  permitir(Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    const categoria = await prisma.categoria.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { tipos: true } } },
    });
    if (!categoria) throw new AppError('Categoria não encontrada.', 404);
    if (categoria._count.tipos > 0) {
      throw new AppError(
        `A categoria possui ${categoria._count.tipos} tipo(s) de equipamento vinculado(s) e não pode ser excluída.`,
        422,
      );
    }
    await prisma.categoria.delete({ where: { id: req.params.id } });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'EXCLUIR_CATEGORIA',
      entidade: 'categoria',
      entidadeId: categoria.id,
      dadosAntes: { nome: categoria.nome },
    });
    res.status(204).end();
  },
);

const tipoSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(2),
  descricao: z.string().nullable().optional(),
  categoriaId: z.string().uuid(),
});

categoriasRouter.post(
  '/tipos',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  validarBody(tipoSchema),
  async (req, res) => {
    const existe = await prisma.tipoEquipamento.findUnique({
      where: { codigo: req.body.codigo },
    });
    if (existe) throw new AppError('Já existe tipo de equipamento com este código.', 409);
    const tipo = await prisma.tipoEquipamento.create({ data: req.body });
    res.status(201).json(tipo);
  },
);

categoriasRouter.patch(
  '/tipos/:id',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  validarBody(tipoSchema.partial()),
  async (req, res) => {
    const antes = await prisma.tipoEquipamento.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Tipo de equipamento não encontrado.', 404);
    if (req.body.codigo && req.body.codigo !== antes.codigo) {
      const duplicado = await prisma.tipoEquipamento.findUnique({
        where: { codigo: req.body.codigo },
      });
      if (duplicado) throw new AppError('Já existe tipo de equipamento com este código.', 409);
    }
    const tipo = await prisma.tipoEquipamento.update({
      where: { id: req.params.id },
      data: req.body,
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_TIPO_EQUIPAMENTO',
      entidade: 'tipo_equipamento',
      entidadeId: tipo.id,
      dadosAntes: antes,
      dadosDepois: req.body,
    });
    res.json(tipo);
  },
);

categoriasRouter.post(
  '/tipos/:id/imagem',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  uploadImagemTipo.single('imagem'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('Envie a imagem no campo "imagem".', 422);
    }
    const antes = await prisma.tipoEquipamento.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Tipo de equipamento não encontrado.', 404);

    removerImagemTipo(antes.imagemUrl);
    const imagemUrl = `/uploads/tipos/${req.file.filename}`;
    const tipo = await prisma.tipoEquipamento.update({
      where: { id: req.params.id },
      data: { imagemUrl },
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_IMAGEM_TIPO_EQUIPAMENTO',
      entidade: 'tipo_equipamento',
      entidadeId: tipo.id,
      dadosAntes: { imagemUrl: antes.imagemUrl },
      dadosDepois: { imagemUrl },
    });
    res.json(tipo);
  },
);

categoriasRouter.delete(
  '/tipos/:id/imagem',
  permitir(Perfil.GESTOR_PATRIMONIO, Perfil.GALPAO),
  async (req, res) => {
    const antes = await prisma.tipoEquipamento.findUnique({ where: { id: req.params.id } });
    if (!antes) throw new AppError('Tipo de equipamento não encontrado.', 404);

    removerImagemTipo(antes.imagemUrl);
    const tipo = await prisma.tipoEquipamento.update({
      where: { id: req.params.id },
      data: { imagemUrl: null },
    });
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ATUALIZAR_IMAGEM_TIPO_EQUIPAMENTO',
      entidade: 'tipo_equipamento',
      entidadeId: tipo.id,
      dadosAntes: { imagemUrl: antes.imagemUrl },
      dadosDepois: { imagemUrl: null },
    });
    res.json(tipo);
  },
);

categoriasRouter.delete(
  '/tipos/:id',
  permitir(Perfil.GESTOR_PATRIMONIO),
  async (req, res) => {
    const tipo = await prisma.tipoEquipamento.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { equipamentos: true, solicitacoes: true } } },
    });
    if (!tipo) throw new AppError('Tipo de equipamento não encontrado.', 404);
    if (tipo._count.equipamentos > 0 || tipo._count.solicitacoes > 0) {
      throw new AppError(
        'O tipo possui equipamentos ou solicitações vinculados e não pode ser excluído.',
        422,
      );
    }
    await prisma.estoqueGalpao.deleteMany({ where: { tipoEquipamentoId: req.params.id } });
    await prisma.tipoEquipamento.delete({ where: { id: req.params.id } });
    removerImagemTipo(tipo.imagemUrl);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'EXCLUIR_TIPO_EQUIPAMENTO',
      entidade: 'tipo_equipamento',
      entidadeId: tipo.id,
      dadosAntes: { codigo: tipo.codigo, nome: tipo.nome },
    });
    res.status(204).end();
  },
);
