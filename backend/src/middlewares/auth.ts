import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Perfil } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export interface AuthPayload {
  sub: string;
  nome: string;
  perfil: Perfil;
  unidadeId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: AuthPayload;
  }
}

// RF01/RF04/RNF05 — valida o JWT em toda rota protegida
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Token de autenticação não informado.', 401);
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    req.usuario = {
      sub: String(payload.sub),
      nome: String(payload.nome),
      perfil: payload.perfil as Perfil,
      unidadeId: (payload.unidadeId as string | null) ?? null,
    };
    next();
  } catch {
    throw new AppError('Sessão expirada ou token inválido. Faça login novamente.', 401);
  }
}
