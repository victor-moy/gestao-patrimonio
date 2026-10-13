import { NextFunction, Request, Response } from 'express';
import { Perfil } from '@prisma/client';
import { AppError } from '../errors/AppError';

// RNF05 — controle de acesso baseado em perfis (RBAC).
// RN03: só o Administrador decide manutenções/orçamentos/laudos.
// RN04: só o Administrador decide cessões e novos itens.
export function permitir(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) {
      throw new AppError('Não autenticado.', 401);
    }
    if (!perfis.includes(req.usuario.perfil)) {
      throw new AppError('Seu perfil não possui permissão para esta operação.', 403);
    }
    next();
  };
}
