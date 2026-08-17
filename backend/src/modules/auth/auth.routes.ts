import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { validarBody } from '../../middlewares/validate';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import * as authService from './auth.service';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email('informe um e-mail válido'),
  senha: z.string().min(1, 'informe a senha'),
});

authRouter.post('/login', validarBody(loginSchema), async (req, res) => {
  const { email, senha } = req.body;
  const resultado = await authService.login(email, senha);
  res.json(resultado);
});

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
