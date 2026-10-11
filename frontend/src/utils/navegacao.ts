/**
 * Troca de usuário (entrar como outro usuário ou voltar ao seu): recarrega a aplicação na página inicial
 * para descartar de vez todo o estado em memória do usuário anterior (listas, contadores, rascunhos).
 */
export function recarregarNoInicio() {
  window.location.assign('/');
}
