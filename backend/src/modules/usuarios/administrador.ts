import { NextFunction, Request, Response } from 'express';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';

// As permissões do token valem por 30 min. Nas rotas de usuários isso é perigoso (quem perdeu a permissão ou foi
// desativado poderia devolvê-la a si mesmo), então o Operador é conferido no banco a cada pedido.
export async function confirmarAdministradorNoBanco(req: Request, _res: Response, next: NextFunction) {
  if (req.usuario?.perfil === Perfil.OPERADOR) {
    const vigente = await prisma.usuario.findFirst({
      where: { id: req.usuario.sub, ativo: true, perfil: Perfil.OPERADOR, permissoes: { has: 'USUARIOS_ADMINISTRAR' } },
      select: { id: true },
    });
    if (!vigente) {
      throw new AppError('Sua permissão para administrar usuários mudou. Entre novamente.', 403);
    }
  }
  next();
}
