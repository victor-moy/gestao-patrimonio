import { NextFunction, Request, Response } from 'express';
import { Perfil } from '@prisma/client';
import { AppError } from '../errors/AppError';
import type { Permissao } from '../lib/permissoes';

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

// Operador: o perfil só vale com a permissão (basta uma das informadas). `outrosPerfis` entram como em `permitir`,
// sem depender de permissão.
export function permitirCom(permissoes: Permissao | Permissao[], ...outrosPerfis: Perfil[]) {
  const aceitas = Array.isArray(permissoes) ? permissoes : [permissoes];
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) {
      throw new AppError('Não autenticado.', 401);
    }
    const { perfil, permissoes: dele } = req.usuario;
    if (outrosPerfis.includes(perfil)) return next();
    if (perfil === Perfil.OPERADOR && aceitas.some((p) => dele.includes(p))) return next();
    throw new AppError('Seu perfil não possui permissão para esta operação.', 403);
  };
}

// Para rotas abertas a vários perfis: só o Operador é conferido (precisa de uma das permissões); os demais seguem
// para as regras da própria rota.
export function restringirOperador(...permissoes: Permissao[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.usuario?.perfil === Perfil.OPERADOR && !permissoes.some((p) => req.usuario!.permissoes.includes(p))) {
      throw new AppError('Seu perfil não possui permissão para esta operação.', 403);
    }
    next();
  };
}
