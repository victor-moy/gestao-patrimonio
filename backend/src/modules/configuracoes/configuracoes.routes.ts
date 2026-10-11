import { Router } from 'express';
import { z } from 'zod';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

export const configuracoesRouter = Router();

const CHAVE_WHATSAPP = 'atendimento.whatsapp';

// Guarda só dígitos com o código do país (55). Aceita "(47) 99999-9999", "+55 47 99999-9999" etc.
export function normalizarWhatsapp(entrada: string): string {
  // Só números brasileiros: um "+" com outro código de país não é aceito
  if (/^\s*\+/.test(entrada) && !/^\s*\+\s*55/.test(entrada)) {
    throw new AppError('Informe um número de WhatsApp do Brasil, com DDD (ex.: 47 99999-9999).', 422);
  }
  const digitos = entrada.replace(/\D/g, '');
  const completo = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (!/^55\d{10,11}$/.test(completo)) {
    throw new AppError('Informe um número de WhatsApp válido, com DDD (ex.: 47 99999-9999).', 422);
  }
  return completo;
}

configuracoesRouter.use(autenticar);

// Contato exibido quando a pessoa não encontra o item na lista (qualquer usuário autenticado lê)
configuracoesRouter.get('/atendimento', async (_req, res) => {
  const registro = await prisma.configuracaoSistema.findUnique({ where: { chave: CHAVE_WHATSAPP } });
  res.json({ whatsapp: registro?.valor ?? null });
});

configuracoesRouter.put(
  '/atendimento',
  permitir(Perfil.GESTOR_PATRIMONIO),
  validarBody(z.object({ whatsapp: z.string().nullable() })),
  async (req, res) => {
    const bruto = (req.body.whatsapp as string | null)?.trim() ?? '';
    const anterior = await prisma.configuracaoSistema.findUnique({ where: { chave: CHAVE_WHATSAPP } });
    let whatsapp: string | null = null;
    if (bruto === '') {
      if (anterior) await prisma.configuracaoSistema.delete({ where: { chave: CHAVE_WHATSAPP } });
    } else {
      whatsapp = normalizarWhatsapp(bruto);
      await prisma.configuracaoSistema.upsert({
        where: { chave: CHAVE_WHATSAPP },
        create: { chave: CHAVE_WHATSAPP, valor: whatsapp },
        update: { valor: whatsapp },
      });
    }
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'ALTERAR_CONTATO_ATENDIMENTO',
      entidade: 'configuracao_sistema',
      entidadeId: CHAVE_WHATSAPP,
      dadosAntes: { whatsapp: anterior?.valor ?? null },
      dadosDepois: { whatsapp },
    });
    res.json({ whatsapp });
  },
);
