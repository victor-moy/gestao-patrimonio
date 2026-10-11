const nodeEnv = process.env.NODE_ENV ?? 'development';
const SEGREDO_DESENVOLVIMENTO = 'dev-secret';

// Em produção o segredo do JWT é obrigatório e precisa ser forte: sem isso
// qualquer um forjaria tokens (inclusive de Gestor). Falha cedo, no boot.
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

export const env = {
  port: Number(process.env.API_PORT ?? 3333),
  nodeEnv,
  jwtSecret: segredoJwt(),
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
