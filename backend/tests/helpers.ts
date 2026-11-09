import jwt from 'jsonwebtoken';
import { Perfil } from '@prisma/client';
import { TODAS_PERMISSOES } from '../src/lib/permissoes';

export function tokenPara(
  perfil: Perfil,
  opcoes: {
    sub?: string;
    unidadeId?: string | null;
    prestadorId?: string | null;
    nome?: string;
    impersonadoPor?: { id: string; nome: string; perfil: Perfil };
    // Só para OPERADOR; sem informar, o operador de teste tem todas as permissões
    permissoes?: string[];
  } = {},
) {
  return jwt.sign(
    {
      nome: opcoes.nome ?? 'Usuário Teste',
      perfil,
      unidadeId: opcoes.unidadeId ?? null,
      prestadorId: opcoes.prestadorId ?? null,
      ...(perfil === 'OPERADOR' ? { permissoes: opcoes.permissoes ?? [...TODAS_PERMISSOES] } : {}),
      ...(opcoes.impersonadoPor ? { impersonadoPor: opcoes.impersonadoPor } : {}),
    },
    'segredo-de-teste',
    { subject: opcoes.sub ?? 'user-1', expiresIn: '30m' },
  );
}

export const auth = (perfil: Perfil, opcoes?: Parameters<typeof tokenPara>[1]) => ({
  Authorization: `Bearer ${tokenPara(perfil, opcoes)}`,
});
