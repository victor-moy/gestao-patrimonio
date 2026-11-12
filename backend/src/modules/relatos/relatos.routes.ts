import { Router } from 'express';
import { z } from 'zod';
import { StatusRelato } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { autenticar } from '../../middlewares/auth';
import { assinaturaAnexo, MAX_ANEXOS_RELATO, removerArquivosUpload, uploadAnexosRelato } from '../../lib/uploads';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { registrarAuditoria } from '../../services/auditoria.service';

export const relatosRouter = Router();

relatosRouter.use(autenticar);

const ID = /^[0-9a-fA-F-]{36}$/;

const SELECAO = {
  id: true,
  perfil: true,
  tela: true,
  esperado: true,
  aconteceu: true,
  navegador: true,
  anexos: true,
  status: true,
  criadoEm: true,
  atualizadoEm: true,
  usuario: { select: { id: true, nome: true, email: true } },
} as const;

const criarSchema = z.object({
  // Caminho interno do sistema (nunca um endereço externo); é só texto de referência, não vira link
  tela: z.string().trim().min(1).max(300).regex(/^\//, 'A tela deve ser um caminho do sistema.'),
  esperado: z.string().trim().max(1500).optional(),
  aconteceu: z.string().trim().min(5, 'Conte o que aconteceu (mínimo de 5 caracteres).').max(3000),
  navegador: z.string().trim().max(300).optional(),
});

// Qualquer usuário autenticado, de qualquer perfil, relata (campos de texto + até 3 anexos, em multipart).
// O limite por usuário vale antes do upload, para o excesso nem chegar ao disco.
relatosRouter.post(
  '/',
  limitarFrequencia({
    janelaMs: 60 * 60 * 1000,
    max: 20,
    chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
    mensagem: 'Você enviou muitos relatos em pouco tempo. Aguarde um pouco e tente novamente.',
  }),
  uploadAnexosRelato.array('anexos', MAX_ANEXOS_RELATO),
  assinaturaAnexo,
  async (req, res, next) => {
    const arquivos = Array.isArray(req.files) ? req.files : [];
    try {
      const { tela, esperado, aconteceu, navegador } = criarSchema.parse(req.body);
      const relato = await prisma.relatoProblema.create({
        data: {
          usuarioId: req.usuario!.sub,
          perfil: req.usuario!.perfil,
          tela,
          esperado: esperado || null,
          aconteceu,
          navegador: navegador || null,
          anexos: arquivos.map((f) => `/uploads/relatos/${f.filename}`),
        },
        select: { id: true, status: true, criadoEm: true },
      });
      res.status(201).json(relato);
    } catch (erro) {
      // Dados inválidos ou falha ao gravar: os anexos já salvos pelo multer não podem ficar órfãos
      await removerArquivosUpload(arquivos);
      if (erro instanceof z.ZodError) {
        const detalhes = erro.issues.map((e) => `${e.path.join('.') || 'corpo'}: ${e.message}`).join('; ');
        next(new AppError(`Dados inválidos — ${detalhes}`, 422));
        return;
      }
      next(erro);
    }
  },
);

// Leitura e triagem: só quem administra usuários (o Administrador)
relatosRouter.get('/', permitirCom('USUARIOS_ADMINISTRAR'), async (req, res) => {
  const status = String(req.query.status ?? '');
  if (status && !(status in StatusRelato)) throw new AppError('Status inválido.', 422);
  const relatos = await prisma.relatoProblema.findMany({
    where: status ? { status: status as StatusRelato } : undefined,
    orderBy: { criadoEm: 'desc' },
    take: 500,
    select: SELECAO,
  });
  res.json(relatos);
});

relatosRouter.get('/:id', permitirCom('USUARIOS_ADMINISTRAR'), async (req, res) => {
  if (!ID.test(req.params.id)) throw new AppError('Relato não encontrado.', 404);
  const relato = await prisma.relatoProblema.findUnique({ where: { id: req.params.id }, select: SELECAO });
  if (!relato) throw new AppError('Relato não encontrado.', 404);
  res.json(relato);
});

relatosRouter.patch(
  '/:id/status',
  permitirCom('USUARIOS_ADMINISTRAR'),
  validarBody(z.object({ status: z.nativeEnum(StatusRelato) })),
  async (req, res) => {
    if (!ID.test(req.params.id)) throw new AppError('Relato não encontrado.', 404);
    const { status } = req.body as { status: StatusRelato };
    const atualizado = await prisma.$transaction(async (tx) => {
      const anterior = await tx.relatoProblema.findUnique({ where: { id: req.params.id }, select: { status: true } });
      if (!anterior) throw new AppError('Relato não encontrado.', 404);
      const novo = await tx.relatoProblema.update({ where: { id: req.params.id }, data: { status }, select: SELECAO });
      await registrarAuditoria(
        {
          usuarioId: req.usuario!.sub,
          acao: 'ALTERAR_STATUS_RELATO',
          entidade: 'relato_problema',
          entidadeId: req.params.id,
          dadosAntes: { status: anterior.status },
          dadosDepois: { status },
        },
        tx,
      );
      return novo;
    });
    res.json(atualizado);
  },
);
