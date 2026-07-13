import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../errors/AppError';

export function validarBody(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const detalhes = err.errors
          .map((e) => `${e.path.join('.') || 'corpo'}: ${e.message}`)
          .join('; ');
        throw new AppError(`Dados inválidos — ${detalhes}`, 422);
      }
      throw err;
    }
  };
}
