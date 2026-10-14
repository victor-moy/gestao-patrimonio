import path from 'path';
import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { FOTOS_DIR, LAUDOS_DIR } from '../../lib/uploads';
import { autenticar } from '../../middlewares/auth';
import { AppError } from '../../errors/AppError';

export const arquivosRouter = Router();

// Os nomes gravados pelo upload são sempre UUID + extensão; qualquer outra
// coisa (../, barras, nomes arbitrários) é recusada antes de tocar o disco.
const NOME_VALIDO = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

function nomeSeguro(nome: string) {
  if (!NOME_VALIDO.test(nome)) throw new AppError('Arquivo não encontrado.', 404);
  return nome;
}

function enviar(res: import('express').Response, pasta: string, nome: string) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(path.join(pasta, nome), (erro) => {
    if (erro && !res.headersSent) res.status(404).json({ mensagem: 'Arquivo não encontrado.' });
  });
}

// Anexos de solicitação e fotos de manutenção civil: mesma regra de leitura do registro de origem
arquivosRouter.get('/solicitacoes/:arquivo', autenticar, async (req, res) => {
  const nome = nomeSeguro(req.params.arquivo);
  const url = `/uploads/solicitacoes/${nome}`;
  const { perfil, unidadeId, prestadorId } = req.usuario!;
  const solicitacao = await prisma.solicitacao.findFirst({
    where: { anexoUrl: url },
    select: { unidadeOrigemId: true, unidadeDestinoId: true },
  });
  if (solicitacao) {
    // Terceirizada não participa de solicitações (a lista de permissão já barra, mas a regra fica explícita aqui)
    if (perfil === Perfil.TERCEIRIZADA) throw new AppError('Arquivo não encontrado.', 404);
    // Unidade só vê as que envolvem a própria unidade
    if (perfil === Perfil.UNIDADE && solicitacao.unidadeOrigemId !== unidadeId && solicitacao.unidadeDestinoId !== unidadeId) {
      throw new AppError('Esta solicitação não envolve a sua unidade.', 403);
    }
    return enviar(res, FOTOS_DIR, nome);
  }
  const manutencao = await prisma.manutencao.findFirst({
    where: { fotos: { has: url } },
    select: { unidadeId: true, contrato: { select: { prestadorId: true } } },
  });
  if (!manutencao) throw new AppError('Arquivo não encontrado.', 404);
  if (perfil === Perfil.UNIDADE && manutencao.unidadeId !== unidadeId) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  if (perfil === Perfil.TERCEIRIZADA && (!prestadorId || manutencao.contrato?.prestadorId !== prestadorId)) {
    throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
  }
  if (perfil === Perfil.GALPAO) throw new AppError('Seu perfil não possui permissão para este arquivo.', 403);
  enviar(res, FOTOS_DIR, nome);
});

// Laudos de baixa: mesma regra de leitura da manutenção (Unidade só vê os da própria unidade)
arquivosRouter.get('/laudos/:arquivo', autenticar, async (req, res) => {
  const nome = nomeSeguro(req.params.arquivo);
  const manutencao = await prisma.manutencao.findFirst({
    where: { laudoBaixa: `/uploads/laudos/${nome}` },
    select: { unidadeId: true },
  });
  if (!manutencao) throw new AppError('Arquivo não encontrado.', 404);
  const { perfil, unidadeId } = req.usuario!;
  if (perfil === Perfil.UNIDADE && manutencao.unidadeId !== unidadeId) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  enviar(res, LAUDOS_DIR, nome);
});
