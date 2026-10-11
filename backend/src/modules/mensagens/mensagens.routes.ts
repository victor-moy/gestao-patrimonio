import { Router } from 'express';
import { z } from 'zod';
import { autenticar } from '../../middlewares/auth';
import { validarBody } from '../../middlewares/validate';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { AppError } from '../../errors/AppError';
import { env } from '../../config/env';
import * as service from './mensagens.service';

const enviarSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escreva uma mensagem.')
    .max(service.LIMITE_TEXTO, `A mensagem pode ter no máximo ${service.LIMITE_TEXTO} caracteres.`),
});

const limiteEnvio = limitarFrequencia({
  janelaMs: 60 * 1000,
  max: 30,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
  mensagem: 'Você está enviando mensagens rápido demais. Aguarde um instante.',
});

const lidaSchema = z.object({ ate: z.string().datetime({ message: 'Informe a data da última mensagem lida.' }) });

const limiteLeitura = limitarFrequencia({
  janelaMs: 60 * 1000,
  max: 120,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
  mensagem: 'Muitas atualizações seguidas. Aguarde um instante.',
});

// Montado em /solicitacoes/:id/mensagens e /manutencoes/:id/mensagens
export function criarMensagensRouter(contexto: service.ContextoChat) {
  const router = Router({ mergeParams: true });
  const idDe = (req: { params: unknown }) => (req.params as { id: string }).id;
  router.use(autenticar);

  router.get('/', async (req, res) => {
    const depoisBruto = req.query.depois as string | undefined;
    const depois = depoisBruto ? new Date(depoisBruto) : undefined;
    if (depois && Number.isNaN(depois.getTime())) {
      throw new AppError('Parâmetro "depois" inválido.', 422);
    }
    res.json(await service.listar(req.usuario!, contexto, idDe(req), depois));
  });

  router.post(
    '/',
    env.rateLimitAtivo ? limiteEnvio : (_req, _res, next) => next(),
    validarBody(enviarSchema),
    async (req, res) => {
      res.status(201).json(await service.enviar(req.usuario!, contexto, idDe(req), req.body.texto));
    },
  );

  // A pessoa leu a conversa até a data informada (a da última mensagem exibida na tela)
  router.post(
    '/lida',
    env.rateLimitAtivo ? limiteLeitura : (_req, _res, next) => next(),
    validarBody(lidaSchema),
    async (req, res) => {
      await service.marcarLida(req.usuario!, contexto, idDe(req), new Date(req.body.ate));
      res.status(204).end();
    },
  );

  return router;
}

// Lista das conversas do usuário (alimenta o menu "Conversas")
export const conversasRouter = Router();
conversasRouter.use(autenticar);
conversasRouter.get('/nao-lidas', async (req, res) => {
  res.json(await service.contarNaoLidas(req.usuario!));
});
conversasRouter.get('/', async (req, res) => {
  res.json(await service.listarConversas(req.usuario!));
});
