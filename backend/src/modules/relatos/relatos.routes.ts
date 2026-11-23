import { Router } from 'express';
import { z } from 'zod';
import { CategoriaRelato, StatusRelato } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { env } from '../../config/env';
import { autenticar } from '../../middlewares/auth';
import { assinaturaAnexo, MAX_ANEXOS_RELATO, removerArquivosUpload, uploadAnexosRelato } from '../../lib/uploads';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { permitirCom } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import * as service from './relatos.service';

export const relatosRouter = Router();

relatosRouter.use(autenticar);

// Confere contra os valores do enum (o operador `in` aceitaria também nomes herdados, como "toString")
const valorDe = <T extends Record<string, string>>(enumeracao: T, bruto: unknown) => {
  const texto = typeof bruto === 'string' ? bruto : '';
  if (!texto) return undefined;
  return (Object.values(enumeracao) as string[]).includes(texto) ? (texto as T[keyof T]) : null;
};

const ID = /^[0-9a-fA-F-]{36}$/;
const idValido = (id: string) => {
  if (!ID.test(id)) throw new AppError('Chamado não encontrado.', 404);
  return id;
};

const criarSchema = z.object({
  categoria: z.nativeEnum(CategoriaRelato).default('BUG'),
  titulo: z.string().trim().min(3, 'Dê um título ao chamado (mínimo de 3 caracteres).').max(80, 'O título pode ter no máximo 80 caracteres.'),
  // Caminho interno do sistema (nunca um endereço externo); é só texto de referência, não vira link
  tela: z.string().trim().min(1).max(300).regex(/^\//, 'A tela deve ser um caminho do sistema.'),
  esperado: z.string().trim().max(1500).optional(),
  aconteceu: z.string().trim().min(5, 'Descreva o chamado (mínimo de 5 caracteres).').max(3000),
  navegador: z.string().trim().max(300).optional(),
});

// Qualquer usuário autenticado, de qualquer perfil, abre um chamado (campos de texto + até 3 anexos, em multipart).
// O limite por usuário vale antes do upload, para o excesso nem chegar ao disco.
relatosRouter.post(
  '/',
  limitarFrequencia({
    janelaMs: 60 * 60 * 1000,
    max: 20,
    chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
    mensagem: 'Você abriu muitos chamados em pouco tempo. Aguarde um pouco e tente novamente.',
  }),
  uploadAnexosRelato.array('anexos', MAX_ANEXOS_RELATO),
  assinaturaAnexo,
  async (req, res, next) => {
    const arquivos = Array.isArray(req.files) ? req.files : [];
    try {
      const { categoria, titulo, tela, esperado, aconteceu, navegador } = criarSchema.parse(req.body);
      const relato = await prisma.relatoProblema.create({
        data: {
          usuarioId: req.usuario!.sub,
          perfil: req.usuario!.perfil,
          categoria,
          titulo,
          tela,
          esperado: esperado || null,
          aconteceu,
          navegador: navegador || null,
          anexos: arquivos.map((f) => `/uploads/relatos/${f.filename}`),
        },
        select: { id: true, numero: true, titulo: true, status: true, criadoEm: true },
      });
      await service.notificarNovoChamado(relato, req.usuario!.sub);
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

// Os chamados de quem está logado (qualquer perfil)
relatosRouter.get('/meus', async (req, res) => {
  res.json(await service.listarMeus(req.usuario!));
});

// Todos os chamados: só o atendimento
relatosRouter.get('/', permitirCom('SUPORTE_ATENDER'), async (req, res) => {
  const status = valorDe(StatusRelato, req.query.status);
  if (status === null) throw new AppError('Status inválido.', 422);
  const categoria = valorDe(CategoriaRelato, req.query.categoria);
  if (categoria === null) throw new AppError('Categoria inválida.', 422);
  res.json(await service.listarTodos({ status, categoria }));
});

// Quem abriu o chamado ou o atendimento
relatosRouter.get('/:id', async (req, res) => {
  res.json(await service.buscar(req.usuario!, idValido(req.params.id)));
});

relatosRouter.patch(
  '/:id/status',
  permitirCom('SUPORTE_ATENDER'),
  validarBody(z.object({ status: z.nativeEnum(StatusRelato) })),
  async (req, res) => {
    res.json(await service.alterarStatus(req.usuario!, idValido(req.params.id), req.body.status));
  },
);

const mensagemSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escreva uma mensagem.')
    .max(service.LIMITE_TEXTO_MENSAGEM, `A mensagem pode ter no máximo ${service.LIMITE_TEXTO_MENSAGEM} caracteres.`),
});

const limiteEnvio = limitarFrequencia({
  janelaMs: 60 * 1000,
  max: 30,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
  mensagem: 'Você está enviando mensagens rápido demais. Aguarde um instante.',
});

relatosRouter.get('/:id/mensagens', async (req, res) => {
  const bruto = req.query.depois as string | undefined;
  const depois = bruto ? new Date(bruto) : undefined;
  if (depois && Number.isNaN(depois.getTime())) throw new AppError('Parâmetro "depois" inválido.', 422);
  res.json(await service.listarMensagens(req.usuario!, idValido(req.params.id), depois));
});

relatosRouter.post(
  '/:id/mensagens',
  env.rateLimitAtivo ? limiteEnvio : (_req, _res, next) => next(),
  validarBody(mensagemSchema),
  async (req, res) => {
    res.status(201).json(await service.enviarMensagem(req.usuario!, idValido(req.params.id), req.body.texto));
  },
);
