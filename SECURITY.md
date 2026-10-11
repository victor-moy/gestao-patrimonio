# Segurança

## Relato de vulnerabilidades

Não publique detalhes de uma vulnerabilidade explorável em uma issue pública. Envie o relato de forma privada ao responsável pelo repositório ou use o recurso de relato privado de vulnerabilidade do GitHub, quando habilitado.

Inclua no relato:

- componente e versão afetados;
- passos mínimos para reprodução;
- impacto observado ou possível;
- pré-condições necessárias;
- sugestão de mitigação, se houver.

Não use dados reais da Secretaria, não persista anexos obtidos durante testes e não realize testes destrutivos em produção.

## Escopo prioritário

As áreas de maior sensibilidade são autenticação JWT, impersonação, RBAC por unidade e por galpão, uploads e downloads de anexos/laudos, importação CSV, movimentações de estoque, saldo de atas e notificações SMTP.

## Controles implementados

- `JWT_SECRET` obrigatório e com no mínimo 32 caracteres em produção (a API falha no boot). Em produção ele é cadastrado como *secret* do ambiente no GitHub (Settings › Environments › demonstracao › Secrets), com um valor diferente para cada ambiente de deploy; localmente fica no `.env`, que não é versionado.
- CORS restrito a `CORS_ORIGINS`; sem configuração, nenhuma origem externa é aceita em produção.
- Limite de frequência no login (por IP + e-mail e teto por IP), na impersonação e nas importações.
- Anexos de solicitação e laudos exigem autenticação e respeitam a unidade do usuário; só as imagens do catálogo de tipos são públicas.
- Uploads validam o tipo real do arquivo (assinatura/magic bytes), não só o MIME informado.
- Estoque e saldo de ata usam débito condicional no banco (e trava de linha na ata), evitando valores negativos sob concorrência.
- O galpão só opera e lista o próprio estoque; o Gestor de Patrimônio informa o galpão explicitamente.
- O frontend (Nginx) envia `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`; `index.html` nunca fica em cache e `/api/metrics` não é exposto pelo Nginx.
- A porta da API (3333) só é publicada no loopback da máquina; o acesso normal passa pelo Nginx.
- Dependências de produção sem vulnerabilidades conhecidas (`npm audit --omit=dev` em backend e frontend).

O baseline e os riscos conhecidos estão documentados em `documentation/reviews/2026-10-09-auditoria-inicial.md`.
