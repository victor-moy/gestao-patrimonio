import jwt from 'jsonwebtoken';
import { Perfil } from '@prisma/client';

export function tokenPara(
  perfil: Perfil,
  opcoes: { sub?: string; unidadeId?: string | null; nome?: string } = {},
) {
  return jwt.sign(
    {
      nome: opcoes.nome ?? 'Usuário Teste',
      perfil,
      unidadeId: opcoes.unidadeId ?? null,
    },
    'segredo-de-teste',
    { subject: opcoes.sub ?? 'user-1', expiresIn: '30m' },
  );
}

export const auth = (perfil: Perfil, opcoes?: Parameters<typeof tokenPara>[1]) => ({
  Authorization: `Bearer ${tokenPara(perfil, opcoes)}`,
});
