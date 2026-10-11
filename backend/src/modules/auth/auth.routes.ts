import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { validarBody } from '../../middlewares/validate';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { env } from '../../config/env';
import * as authService from './auth.service';

export const authRouter = Router();

// Freia tentativa de adivinhar senha. A chave é IP + e-mail (uma conta por origem), porque
// muitos servidores da Secretaria saem pelo mesmo IP e um teto só por IP bloquearia todos;
// o teto por IP, bem mais alto, só barra varredura de várias contas.
const limiteLoginPorConta = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 10,
  chave: (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});
const limiteLoginPorIp = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 300,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});
const limiteImpersonacao = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 30,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
});
const passa = (_req: unknown, _res: unknown, next: () => void) => next();

const loginSchema = z.object({
  email: z.string().email('informe um e-mail válido'),
  senha: z.string().min(1, 'informe a senha'),
});

authRouter.post(
  '/login',
  env.rateLimitAtivo ? limiteLoginPorIp : passa,
  validarBody(loginSchema),
  env.rateLimitAtivo ? limiteLoginPorConta : passa,
  async (req, res) => {
    const { email, senha } = req.body;
    const resultado = await authService.login(email, senha);
    res.json(resultado);
  },
);

authRouter.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.sub },
    select: {
      id: true,
      nome: true,
      email: true,
      matricula: true,
      perfil: true,
      unidadeId: true,
      unidade: { select: { nome: true } },
    },
  });
  if (!usuario) throw new AppError('Usuário não encontrado.', 404);
  res.json({ ...usuario, unidadeNome: usuario.unidade?.nome ?? null, unidade: undefined });
});

// Impersonação — só o Gestor de Patrimônio, pra facilitar testar outros
// perfis sem precisar deslogar e logar de novo com outra conta.
authRouter.post(
  '/impersonar/:id',
  autenticar,
  permitir(Perfil.GESTOR_PATRIMONIO),
  env.rateLimitAtivo ? limiteImpersonacao : passa,
  async (req, res) => {
    const resultado = await authService.impersonar(req.params.id);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'IMPERSONAR_USUARIO',
      entidade: 'usuario',
      entidadeId: req.params.id,
      dadosDepois: { impersonadoPor: req.usuario!.sub, impersonadoPorNome: req.usuario!.nome },
    });
    res.json(resultado);
  },
);
