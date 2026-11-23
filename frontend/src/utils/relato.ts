// Anexos do bug: o total por envio fica abaixo do limite do Nginx (10 MB); o backend confere de novo
export const MAX_ANEXOS_BUG = 3;
export const TAMANHO_MAX_ANEXO = 3 * 1024 * 1024;
export const TIPOS_ANEXO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Devolve o motivo de o arquivo não poder ser anexado, ou null se está tudo certo
export function problemaDoAnexo(arquivo: File) {
  if (!TIPOS_ANEXO.includes(arquivo.type)) return `"${arquivo.name}": use PDF, PNG, JPG ou WebP.`;
  if (arquivo.size > TAMANHO_MAX_ANEXO) return `"${arquivo.name}" passa de 3 MB.`;
  return null;
}

// Tela de origem do chamado: só caminhos internos do sistema (nunca endereço externo) e nunca as páginas do próprio suporte
export function telaDeOrigem(valor: string | null | undefined) {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/suporte')) return '/';
  return valor.slice(0, 300);
}

// Endereço do suporte (a lista dos chamados da pessoa) levando a tela de onde ela está, para o "Novo chamado" saber a origem.
// Já dentro do suporte, o link mantém a origem em vez de apontar para si mesmo.
export function caminhoSuporte(pathname: string, search: string) {
  if (pathname.startsWith('/suporte/novo')) return `/suporte${search}`;
  if (pathname.startsWith('/suporte')) return pathname === '/suporte' ? `/suporte${search}` : '/suporte';
  return `/suporte?de=${encodeURIComponent(`${pathname}${search}`)}`;
}

// Protocolo do chamado (SUP-0007), como SOL-0012 e MAN-0007
export const codigoSuporte = (numero: number) => `SUP-${String(numero).padStart(4, '0')}`;

export const ROTULO_CATEGORIA_RELATO: Record<string, string> = {
  BUG: 'Bug',
  MELHORIA: 'Melhoria',
  NOVA_FUNCIONALIDADE: 'Nova funcionalidade',
  DUVIDA: 'Dúvida',
  OUTRO: 'Outro',
};

export const ROTULO_STATUS_RELATO: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_RETORNO: 'Aguardando retorno',
  RESOLVIDO: 'Resolvido',
};
