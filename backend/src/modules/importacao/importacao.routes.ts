import { Router } from 'express';
import multer from 'multer';
import { Perfil } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { AppError } from '../../errors/AppError';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { env } from '../../config/env';
import * as service from './importacao.service';

export const importacaoRouter = Router();

export const limiteImportacao = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 20,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// UC01 — o Galpão importa o CSV do e-Pública
importacaoRouter.post(
  '/csv',
  autenticar,
  permitir(Perfil.GALPAO, Perfil.GESTOR_PATRIMONIO),
  (req, res, next) => (env.rateLimitAtivo ? limiteImportacao(req, res, next) : next()),
  upload.single('arquivo'),
  async (req, res) => {
    if (!req.file) {
      throw new AppError('Envie o arquivo CSV no campo "arquivo".', 422);
    }
    const resultado = await service.importarCsv(req.usuario!.sub, req.file.buffer);
    res.json(resultado);
  },
);
