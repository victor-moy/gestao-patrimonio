import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

interface Opcoes {
  janelaMs: number;
  max: number;
  // Identifica quem está sendo limitado (padrão: IP). Use o usuário em rotas autenticadas.
  chave?: (req: Request) => string;
  mensagem?: string;
}

// Limitador de frequência em memória (janela fixa). Suficiente para uma única
// instância da API; com várias réplicas troque por um armazenamento compartilhado.
export function limitarFrequencia({ janelaMs, max, chave, mensagem }: Opcoes) {
  const contadores = new Map<string, { total: number; expiraEm: number }>();

  return (req: Request, _res: Response, next: NextFunction) => {
    const agora = Date.now();
    if (contadores.size > 5000) {
      for (const [k, v] of contadores) if (v.expiraEm <= agora) contadores.delete(k);
    }
    const id = chave ? chave(req) : (req.ip ?? 'desconhecido');
    const atual = contadores.get(id);
    if (!atual || atual.expiraEm <= agora) {
      contadores.set(id, { total: 1, expiraEm: agora + janelaMs });
      return next();
    }
    atual.total += 1;
    if (atual.total > max) {
      throw new AppError(mensagem ?? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
    }
    next();
  };
}
