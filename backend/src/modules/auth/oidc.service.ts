import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Client, Issuer, generators } from 'openid-client';
import { env } from '../../config/env';
import { AppError } from '../../errors/AppError';

// Login pelo Keycloak (OpenID Connect, Authorization Code + PKCE). Aqui só mora o protocolo; quem vira usuário do
// SGP e com qual perfil é decidido em auth.service.

export const COOKIE_OIDC = 'sgp_oidc';
const VALIDADE_LOGIN_S = 10 * 60;

export interface IdentidadeKeycloak {
  sub: string;
  email: string;
  nome: string;
  usuario: string | null;
}

let clientEmCache: Promise<Client> | null = null;

function exigirAtivo() {
  if (!env.oidc.ativo) throw new AppError('O login institucional não está configurado.', 503);
}

// A descoberta (endpoints e chaves) vem do issuer; guarda o resultado e tenta de novo se o Keycloak estava fora.
function obterClient() {
  exigirAtivo();
  clientEmCache ??= Issuer.discover(env.oidc.issuer)
    .then(
      (issuer) =>
        new issuer.Client({
          client_id: env.oidc.clientId,
          client_secret: env.oidc.clientSecret,
          redirect_uris: [env.oidc.redirectUri],
          post_logout_redirect_uris: [env.oidc.postLogoutUri],
          response_types: ['code'],
        }),
    )
    .catch((erro) => {
      clientEmCache = null;
      throw erro;
    });
  return clientEmCache;
}

// Os valores que o callback precisa conferir (state, nonce, PKCE) ficam num cookie assinado e de curta duração.
// A chave é derivada do segredo do JWT, mas é outra: o cookie é entregue a qualquer visitante em /auth/oidc/login,
// então, assinado com a chave das sessões, serviria de token de acesso.
const AUDIENCIA_COOKIE = 'sgp-oidc-login';
const chaveCookie = () => createHmac('sha256', env.jwtSecret).update(AUDIENCIA_COOKIE).digest('hex');

export function assinarCookieLogin(dados: { state: string; nonce: string; verifier: string }) {
  return jwt.sign(dados, chaveCookie(), { expiresIn: VALIDADE_LOGIN_S, audience: AUDIENCIA_COOKIE });
}

export async function iniciarLogin() {
  const client = await obterClient();
  const state = generators.state();
  const nonce = generators.nonce();
  const verifier = generators.codeVerifier();
  const url = client.authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: generators.codeChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const cookie = assinarCookieLogin({ state, nonce, verifier });
  return { url, cookie, validadeS: VALIDADE_LOGIN_S };
}

export function lerCookieLogin(cookie: string | undefined) {
  try {
    const payload = jwt.verify(String(cookie), chaveCookie(), { audience: AUDIENCIA_COOKIE }) as jwt.JwtPayload;
    return { state: String(payload.state), nonce: String(payload.nonce), verifier: String(payload.verifier) };
  } catch {
    throw new AppError('A tentativa de login expirou. Entre novamente.', 400);
  }
}

export async function concluirLogin(
  urlDoPedido: string,
  cookie: string | undefined,
): Promise<IdentidadeKeycloak> {
  const client = await obterClient();
  const { state, nonce, verifier } = lerCookieLogin(cookie);
  const params = client.callbackParams(urlDoPedido);
  if (params.error) throw new AppError('O login institucional foi cancelado ou recusado.', 401);
  let claims;
  try {
    // Valida assinatura, emissor, público, validade, nonce e state do id_token
    const tokens = await client.callback(env.oidc.redirectUri, params, { state, nonce, code_verifier: verifier });
    claims = tokens.claims();
    if (!claims.email) {
      const info = await client.userinfo(tokens);
      claims = { ...claims, ...info };
    }
  } catch {
    throw new AppError('Não foi possível validar o login institucional. Entre novamente.', 401);
  }
  if (!claims.email) throw new AppError('O login institucional não informou o e-mail do usuário.', 403);
  return {
    sub: claims.sub,
    email: String(claims.email).trim().toLowerCase(),
    nome: String(claims.name ?? claims.preferred_username ?? claims.email),
    usuario: claims.preferred_username ? String(claims.preferred_username) : null,
  };
}

// Encerra também a sessão do Keycloak; senão o próximo "Entrar" voltaria direto, sem pedir credencial.
export async function urlDeLogout() {
  if (!env.oidc.ativo) return env.oidc.postLogoutUri || '/';
  const client = await obterClient();
  return client.endSessionUrl({
    client_id: env.oidc.clientId,
    post_logout_redirect_uri: env.oidc.postLogoutUri,
  });
}

// Onde o navegador cai depois do login: uma rota do frontend, na mesma origem do site.
export function urlRetornoFrontend(token: string) {
  const url = new URL('/login/retorno', env.oidc.postLogoutUri || 'http://localhost');
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

// Qualquer falha volta para a tela de login, que é uma só.
export const urlTelaDeLogin = () => env.oidc.postLogoutUri || '/';
