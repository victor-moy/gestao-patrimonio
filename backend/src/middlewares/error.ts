import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

// RNF11 — mensagens de erro claras, sem expor detalhes técnicos internos
export function tratarErros(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ mensagem: err.message });
  }
  console.error(err);
  return res
    .status(500)
    .json({ mensagem: 'Ocorreu um erro interno. Tente novamente ou contate o suporte.' });
}
