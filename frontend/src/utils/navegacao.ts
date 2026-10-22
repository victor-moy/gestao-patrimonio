/**
 * Troca de usuário (entrar como outro usuário ou voltar ao seu): recarrega a aplicação na página inicial
 * para descartar de vez todo o estado em memória do usuário anterior (listas, contadores, rascunhos).
 */
export function recarregarNoInicio() {
  window.location.assign('/');
}

/**
 * Sair do sistema: além de descartar a sessão do SGP, encerra a do Keycloak. Sem isso o próximo "Entrar" voltaria
 * direto, sem pedir credencial (o que atrapalha em computador compartilhado).
 */
export function encerrarSessaoInstitucional(urlApi: string) {
  window.location.assign(`${urlApi}/auth/oidc/logout`);
}
