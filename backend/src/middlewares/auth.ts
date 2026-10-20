import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Perfil } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

export interface ImpersonadoPor {
  id: string;
  nome: string;
  perfil: Perfil;
}

export interface AuthPayload {
  sub: string;
  nome: string;
  perfil: Perfil;
  unidadeId: string | null;
  // Só no perfil TERCEIRIZADA: o prestador de serviço do usuário (sempre vem do token, nunca do corpo/query)
  prestadorId: string | null;
  // Preenchido quando o Administrador está "entrando como" este usuário; a auditoria grava os dois.
  impersonadoPor: ImpersonadoPor | null;
}

export const contextoPedido = new AsyncLocalStorage<AuthPayload>();

function impersonadoPorDoToken(payload: jwt.JwtPayload): ImpersonadoPor | null {
  const bruto = payload.impersonadoPor;
  if (!bruto || typeof bruto !== 'object') return null;
  const { id, nome, perfil } = bruto as Record<string, unknown>;
  if (typeof id !== 'string' || typeof nome !== 'string' || typeof perfil !== 'string') return null;
  return { id, nome, perfil: perfil as Perfil };
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: AuthPayload;
  }
}

// Perfil externo (empresa prestadora): lista de permissão, negado por padrão. Vale em toda rota que usa
// `autenticar`, inclusive as que não restringem perfil, para um endpoint novo nunca ficar aberto por esquecimento.
const ID = '[0-9a-fA-F-]{36}';
const ROTAS_TERCEIRIZADA: Array<[string, RegExp]> = [
  ['GET', /^\/auth\/me$/],
  ['GET', /^\/manutencoes$/],
  ['GET', new RegExp(`^/manutencoes/${ID}$`)],
  ['GET', new RegExp(`^/manutencoes/${ID}/(historico|trajetoria)$`)],
  ['POST', new RegExp(`^/manutencoes/${ID}/(orcamento|registrar-retorno|relatorio|iniciar-execucao|solicitar-reencaminhamento)$`)],
  ['DELETE', new RegExp(`^/manutencoes/${ID}/relatorio/${ID}$`)],
  // Fotos do chamado civil (a rota confere se o chamado é de um contrato do prestador)
  ['GET', /^\/uploads\/solicitacoes\/[0-9a-f-]{36}\.(jpg|png|webp)$/],
  ['GET', new RegExp(`^/manutencoes/${ID}/mensagens$`)],
  ['POST', new RegExp(`^/manutencoes/${ID}/mensagens(/lida)?$`)],
  ['GET', /^\/conversas(\/nao-lidas)?$/],
  ['GET', /^\/contratos$/],
  // Tabela SINAPI: o prestador escolhe nela os serviços e materiais do orçamento
  ['GET', /^\/sinapi$/],
  // Home: pendências/riscos e atualizações in-app
  ['GET', /^\/dashboard\/alertas$/],
  ['GET', /^\/avisos$/],
  ['POST', /^\/avisos\/ler-todas$/],
  ['POST', new RegExp(`^/avisos/${ID}/ler$`)],
];

export function terceirizadaPodeAcessar(metodo: string, caminho: string) {
  const limpo = caminho.split('?')[0].replace(/\/+$/, '') || '/';
  return ROTAS_TERCEIRIZADA.some(([m, re]) => m === metodo && re.test(limpo));
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
      prestadorId: (payload.prestadorId as string | null) ?? null,
      impersonadoPor: impersonadoPorDoToken(payload),
    };
  } catch {
    throw new AppError('Sessão expirada ou token inválido. Faça login novamente.', 401);
  }
  if (req.usuario.perfil === 'TERCEIRIZADA' && !terceirizadaPodeAcessar(req.method, req.originalUrl)) {
    throw new AppError('Seu perfil não possui permissão para esta operação.', 403);
  }
  contextoPedido.run(req.usuario, () => next());
}
