import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { z } from 'zod';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import * as service from './assistente.service';

export const assistenteRouter = Router();

// Mesmo público dos relatórios de Solicitações — o assistente só responde
// perguntas sobre esses dados.
assistenteRouter.use(autenticar, permitir(Perfil.GESTOR_PATRIMONIO));

const perguntarSchema = z.object({
  mensagens: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

assistenteRouter.post('/perguntar', validarBody(perguntarSchema), async (req, res) => {
  const resposta = await service.responder(req.body.mensagens);
  res.json({ resposta });
});
