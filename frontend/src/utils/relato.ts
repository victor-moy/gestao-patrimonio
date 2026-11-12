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

// Tela de origem do bug: só caminhos internos do sistema (nunca endereço externo) e nunca a própria página do bug
export function telaDeOrigem(valor: string | null | undefined) {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/reportar-bug')) return '/';
  return valor.slice(0, 300);
}

// Endereço da página de bug levando a tela de onde a pessoa está (ou a de origem, se já estiver nela)
export function caminhoRelato(pathname: string, search: string) {
  if (pathname.startsWith('/reportar-bug')) return `${pathname}${search}`;
  return `/reportar-bug?de=${encodeURIComponent(`${pathname}${search}`)}`;
}

export const ROTULO_STATUS_RELATO: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  RESOLVIDO: 'Resolvido',
};
