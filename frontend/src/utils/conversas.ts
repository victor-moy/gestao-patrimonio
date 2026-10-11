import type { ConversaResumo } from '../types';
import { codigoManutencao, codigoSolicitacao, ROTULO_TIPO_SOLICITACAO } from './format';

export type ContextoConversa = ConversaResumo['contexto'];

export const caminhoConversa = (contexto: ContextoConversa, id: string) => `/conversas/${contexto}/${id}`;
export const caminhoMensagens = (contexto: ContextoConversa, id: string) =>
  `/${contexto === 'solicitacao' ? 'solicitacoes' : 'manutencoes'}/${id}/mensagens`;
export const caminhoOrigem = (contexto: ContextoConversa, id: string) =>
  `/${contexto === 'solicitacao' ? 'solicitacoes' : 'manutencoes'}/${id}`;

// Título curto da conversa: "Ampliação · Autoclave" / "Manutenção · Microscópio"
export function tituloConversa(c: Pick<ConversaResumo, 'contexto' | 'tipoSolicitacao' | 'item'>) {
  const tipo = c.contexto === 'manutencao' ? 'Manutenção' : (ROTULO_TIPO_SOLICITACAO[c.tipoSolicitacao ?? ''] ?? 'Solicitação');
  return c.item ? `${tipo} · ${c.item}` : tipo;
}

export const codigoConversa = (c: Pick<ConversaResumo, 'contexto' | 'numero'>) =>
  c.contexto === 'manutencao' ? codigoManutencao(c.numero) : codigoSolicitacao(c.numero);
