/**
 * Sair do sistema: além de descartar a sessão do SGP, encerra a do Keycloak. Sem isso o próximo "Entrar" voltaria
 * direto, sem pedir credencial (o que atrapalha em computador compartilhado).
 */
export function encerrarSessaoInstitucional(urlApi: string) {
  window.location.assign(`${urlApi}/auth/oidc/logout`);
}
