const nodeEnv = process.env.NODE_ENV ?? 'development';
const SEGREDO_DESENVOLVIMENTO = 'dev-secret';

// Em produção o segredo do JWT é obrigatório e precisa ser forte: sem isso
// qualquer um forjaria tokens (inclusive de Administrador). Falha cedo, no boot.
function segredoJwt() {
  const segredo = process.env.JWT_SECRET;
  if (nodeEnv === 'production') {
    if (!segredo || segredo === SEGREDO_DESENVOLVIMENTO || segredo.length < 32) {
      throw new Error('JWT_SECRET deve ser definido com pelo menos 32 caracteres em produção.');
    }
    return segredo;
  }
  return segredo ?? SEGREDO_DESENVOLVIMENTO;
}

// Origens autorizadas a chamar a API pelo navegador (CORS_ORIGINS, separadas por
// vírgula). Em produção o frontend fala com a API pelo mesmo domínio (Nginx em
// /api), então sem configuração nenhuma origem externa é aceita.
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Login pelo Keycloak da Prefeitura (OpenID Connect). Em produção as cinco variáveis são obrigatórias e a API
// não inicia sem elas; fora de produção, sem elas o login institucional fica desligado.
function configuracaoOidc() {
  const oidc = {
    issuer: process.env.OIDC_ISSUER ?? '',
    clientId: process.env.OIDC_CLIENT_ID ?? '',
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
    redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
    postLogoutUri: process.env.OIDC_POST_LOGOUT_URI ?? '',
  };
  const faltando = Object.entries(oidc)
    .filter(([, valor]) => !valor)
    .map(([chave]) => chave);
  if (nodeEnv === 'production' && faltando.length) {
    throw new Error(`Defina as variáveis do Keycloak em produção: ${faltando.map((c) => `OIDC_${c.replace(/[A-Z]/g, (l) => `_${l}`).toUpperCase()}`).join(', ')}.`);
  }
  return { ...oidc, ativo: faltando.length === 0 };
}

// Acesso temporário da demonstração (/auth/demo), enquanto o Keycloak não responde ao servidor. Sem a chave, a rota não
// existe. Com ela, a chave precisa ser forte: quem a tiver entra no perfil que escolher.
function chaveDemonstracao() {
  const chave = process.env.DEMO_LOGIN_CHAVE ?? '';
  if (chave && chave.length < 32) {
    throw new Error('DEMO_LOGIN_CHAVE deve ter pelo menos 32 caracteres (ou ficar vazia para desligar o acesso).');
  }
  return chave;
}

export const env = {
  demoLogin: { chave: chaveDemonstracao() },
  port: Number(process.env.API_PORT ?? 3333),
  nodeEnv,
  jwtSecret: segredoJwt(),
  oidc: configuracaoOidc(),
  corsOrigins,
  // Limites de frequência ficam desligados nos testes automatizados
  rateLimitAtivo: nodeEnv !== 'test',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
  smtp: {
    enabled: process.env.SMTP_ENABLED === 'true',
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'SGP <sgp@joinville.sc.gov.br>',
  },
};
