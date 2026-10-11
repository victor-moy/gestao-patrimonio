// Interpreta uma busca como número de requisição: "12", "SOL-0012", "sol 12", "#12".
// Retorna null quando o texto não tem esse formato (ex.: nome de unidade) ou o prefixo é de outro tipo.
const FORMATO = /^(SOL|MAN)?[-\s#]*0*(\d{1,9})$/i;

export function numeroDaBusca(busca: string, prefixo: 'SOL' | 'MAN'): number | null {
  const m = FORMATO.exec(busca.trim());
  if (!m) return null;
  if (m[1] && m[1].toUpperCase() !== prefixo) return null;
  return Number(m[2]);
}
