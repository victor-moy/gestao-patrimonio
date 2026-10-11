import type { Ata } from '../types';

export type SituacaoAta = 'ATIVA' | 'VENCENDO' | 'VENCIDA' | 'INATIVA';

export const ROTULO_SITUACAO_ATA: Record<SituacaoAta, string> = {
  ATIVA: 'Ativa',
  VENCENDO: 'Vencendo',
  VENCIDA: 'Vencida',
  INATIVA: 'Inativa',
};

export const TOM_SITUACAO_ATA: Record<SituacaoAta, string> = {
  ATIVA: 'green',
  VENCENDO: 'yellow',
  VENCIDA: 'red',
  INATIVA: 'gray',
};

const DIA_MS = 24 * 60 * 60 * 1000;

// Mesmas regras do alerta do backend (RF33): vence em até 30 dias ou saldo < 10%.
export function analisarAta(ata: Ata, agora = new Date()) {
  const valorTotal = Number(ata.valorTotal);
  const saldo = Number(ata.saldo);
  const vencimento = new Date(ata.vencimento);
  const diasParaVencer = Math.ceil((vencimento.getTime() - agora.getTime()) / DIA_MS);
  const vencida = vencimento < agora;
  const vencendo = !vencida && diasParaVencer <= 30;
  const situacao: SituacaoAta = !ata.ativo ? 'INATIVA' : vencida ? 'VENCIDA' : vencendo ? 'VENCENDO' : 'ATIVA';
  return {
    valorTotal,
    saldo,
    utilizado: valorTotal > 0 ? ((valorTotal - saldo) / valorTotal) * 100 : 0,
    saldoBaixo: valorTotal > 0 && saldo / valorTotal < 0.1,
    diasParaVencer,
    situacao,
  };
}

export const ROTULO_STATUS_CONTRATO: Record<string, string> = {
  ATIVO: 'Ativo',
  RENOVACAO_PENDENTE: 'Pendente',
  EXPIRADO: 'Expirado',
};

export const TOM_STATUS_CONTRATO: Record<string, string> = {
  ATIVO: 'green',
  RENOVACAO_PENDENTE: 'yellow',
  EXPIRADO: 'red',
};

export const TIPOS_CONTRATO = [
  'Manutenção Preventiva',
  'Manutenção Corretiva',
  'Calibração',
  'Garantia Estendida',
  'Serviços Gerais',
];
