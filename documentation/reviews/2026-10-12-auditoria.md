# Auditoria de código — 12/10/2026

Segunda auditoria, depois de `2026-10-09-auditoria-inicial.md`. Cobre segurança, controle de acesso, integridade do banco, código em desuso, testes e documentação. Foi só leitura: nenhum código de produção foi alterado (apenas este arquivo foi criado) e nenhum achado abaixo foi corrigido ainda.

## Como foi feita

- `lint`, `build` e `test:coverage` nos dois lados; `npm audit --omit=dev` (0 vulnerabilidades reportadas em backend e frontend) e `npm outdated`.
- Matriz de acesso real: todas as rotas lidas no código e as leituras testadas na API em execução com um usuário de cada perfil (Gestor de Patrimônio, Gestor de Manutenção, Unidade e Galpão), sem criar dados.
- Migrações aplicadas num PostgreSQL descartável (só com o que está no repositório) e comparadas ao `schema.prisma` (`prisma migrate diff`).
- Varreduras de código sem uso: exportações, arquivos, classes e variáveis de CSS, endpoints sem chamador no frontend, dependências, `tsc --noUnusedLocals`.
- Documentos conferidos contra o código: README, AGENTS, CONTRIBUTING, SECURITY, DESIGN-SYSTEM e as quatro páginas da Wiki.

**Resumo:** 0 achados críticos, 5 médios, 8 baixos e 1 informativo. Baseline: backend 278 testes + 6 de PostgreSQL real (ignorados sem `TEST_DATABASE_URL`), 88% de linhas; frontend 109 testes, 79% de linhas; lint e build aprovados.

## Segurança

| # | Severidade | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| S1 | Média | **`multer` 1.4.5-lts.2 está depreciado por vulnerabilidades já corrigidas na 2.x** (negação de serviço por multipart malformado). O `npm audit` não acusa, e o `SECURITY.md` afirma que não há vulnerabilidades conhecidas em produção. Qualquer usuário autenticado, inclusive `UNIDADE`, alcança um upload (`POST /solicitacoes/:id/anexo`). | `npm view multer@1.4.5-lts.2 deprecated` | Subir para `multer@^2` (mesma API), conferir os testes de upload e corrigir a frase do `SECURITY.md`. |
| S2 | Média | **Leitura sem restrição de perfil.** Só a `UNIDADE` é filtrada; os demais perfis leem tudo que a rota devolver. Gestor de Manutenção lê `GET /solicitacoes` (+ `/:id`, `/historico`); Galpão lê `GET /manutencoes` (+ `/:id`, `/historico`); Gestor de Manutenção e Galpão leem `GET /atas` e `/atas/alertas` (saldo e valores); Gestor de Manutenção lê `GET /dashboard`. | Matriz testada na API: 200 onde o [AGENTS.md](../../AGENTS.md) prevê só o Gestor de Patrimônio (Atas) ou o ciclo de outro perfil. | Aplicar `permitir(...)` por perfil nessas rotas, conforme o mapa de acesso, e cobrir com um teste de matriz perfil × rota. |
| S3 | Média | **A API devolve à Unidade dados que a tela esconde:** `ata` (número, **saldo**, vencimento), `valorVinculado`, `prioridade`, e-mail-base das duas unidades e quem decidiu. A regra de negócio é que quem pede nunca vê ata nem saldo. | `includePadrao` em `solicitacoes.comum.ts` não distingue perfil. | Serializar por perfil: remover esses campos da resposta para `UNIDADE` (e Galpão). |
| S4 | Média | **Sessão e impersonação.** O token (30 min) não é conferido no banco: um usuário desativado, ou com perfil/unidade alterados, continua com o acesso antigo até expirar. O token de impersonação não registra quem o originou, então as ações feitas em "Entrar como" ficam auditadas com o nome do usuário impersonado (só o início é registrado). Um Gestor de Patrimônio impersonado também pode impersonar outros. Pendência já listada na auditoria anterior (item 9). | `middlewares/auth.ts` e `auth.service.ts`: `gerarSessao` não grava `impersonadoPor`. | Incluir `impersonadoPor` no JWT e na auditoria, impedir impersonar outro Gestor de Patrimônio e consultar `ativo` do usuário a cada requisição (ou reduzir a validade). |
| S5 | Média | **Parâmetros de consulta sem validação** devolvem erro 500: `?busca=a&busca=b` (repetido) e `?status=INVALIDO` em solicitações, manutenções, equipamentos e relatórios. Não derruba o processo, mas contraria "entradas externas validadas com Zod" e vira ruído de erro. | Testado na API: 500 em 6 de 7 chamadas. | Validar `req.query` com Zod (422). |
| S6 | Baixa | **Infra:** Grafana sobe com senha `admin` por padrão e publicada em `0.0.0.0:3000` quando o perfil `observability` é usado; o Postgres cai em `sgp`/`sgp` se `POSTGRES_PASSWORD` faltar; o container da API roda como `root`; sem `Strict-Transport-Security` (o TLS é externo ao projeto). | `docker-compose.yml`, `backend/Dockerfile`, `frontend/security-headers.inc`. | `GRAFANA_PASSWORD:?`, publicar o Grafana em `127.0.0.1`, exigir `POSTGRES_PASSWORD`, `USER node` na API e HSTS no proxy que termina o TLS. |
| S7 | Baixa | **CI e dependências:** o workflow não declara `permissions:` (o token vem com escrita por padrão), as *actions* usam tags e não SHAs, e não há Dependabot/Renovate (foi assim que o `multer` passou). | `.github/workflows/ci.yml`; `.github/` só tem `workflows`. | `permissions: contents: read`, `dependabot.yml` (npm, docker e actions) e `engines` nos `package.json`. |
| S8 | Baixa | **Login:** o código devolve erro antes do `bcrypt.compare` quando o e-mail não existe ou está inativo, e a diferença de tempo permite enumerar e-mails válidos. Senha mínima de 6 caracteres e sem troca obrigatória no primeiro acesso. | `auth.service.ts`, `usuarios.routes.ts`. | Fazer um `compare` fictício, subir o mínimo para 10 e avaliar troca no primeiro acesso. |
| S9 | Baixa | **Download de anexos e laudos** só restringe por perfil a `UNIDADE`; Galpão e Gestor de Manutenção passam pelo arquivo se souberem o nome (UUID, difícil de adivinhar). | `arquivos.routes.ts`. | Lista de perfis por tipo de arquivo, como nas conversas. |
| S10 | Baixa | **Escrita além do documentado:** o Galpão pode criar e editar categorias e tipos de item e enviar ou apagar imagens (`POST/PATCH /categorias`, `/categorias/tipos`, `/tipos/:id/imagem`), enquanto o AGENTS diz que Configurações são do Gestor de Patrimônio. | `categorias.routes.ts`. | Decidir: restringir ao Gestor de Patrimônio ou documentar a exceção. |
| S11 | Baixa | **Listagens sem paginação no servidor** (36 `findMany`, só conversas e painel têm `take`): solicitações, manutenções, equipamentos, usuários, atas, contratos e relatórios. O AGENTS exige paginação e limite máximo. Já era o item 16 da auditoria anterior. | `grep take:` | Paginação com limite máximo nas listas que crescem. |
| S12 | Baixa | **Seed** cria todos os usuários com a mesma senha fixa e não recusa rodar em produção. | `prisma/seed.ts` | Recusar com `NODE_ENV=production` e avisar na Wiki. |
| S13 | Baixa | O limitador de frequência é em memória (uma instância) e o agendador de SLA roda em cada réplica. Já documentado; vale só se a API escalar. | `rateLimit.ts`, `server.ts` | Armazenamento compartilhado se houver mais de uma instância. |
| S14 | Informativa | Token em `localStorage`, mitigado pela CSP restritiva. Item 9 da auditoria anterior. | `api/client.ts` | Avaliar cookie `HttpOnly`. |

Pontos verificados e sem problema: segredo JWT obrigatório e forte em produção, CORS por lista, CSP e demais cabeçalhos no Nginx, downloads protegidos com nome validado contra *path traversal*, assinatura dos arquivos conferida, `Prisma.raw` só com texto fixo (sem entrada do usuário), nenhuma `dangerouslySetInnerHTML`/`eval`, `target="_blank"` com `rel`, nenhum segredo nem chave em arquivos versionados, rotas todas atrás de `autenticar`, API do Postgres e da API só em rede interna/loopback.

## Integridade do banco e migrações

- **Divergência entre migrações e `schema.prisma`:** a chave estrangeira `equipamento.criado_por_solicitacao_id` é `NO ACTION` nas migrações e `SET NULL` no schema. Num banco novo, apagar uma solicitação que gerou equipamentos falha. Foi exatamente o que travou a limpeza do banco local. Corrigir com uma migração nova.
- **Banco local fora do histórico do repositório:** o PostgreSQL de desenvolvimento tem migrações aplicadas que não existem no git (`20261008120000_*`, `20261008150000_*`, agora duas pastas vazias não versionadas) e as tabelas antigas `leitura_conversa` e `mensagem_manutencao`. Um banco criado do zero não é afetado. Para alinhar o ambiente local seria preciso recriar o volume (exige autorização).
- Valores de enum só por compatibilidade, sem uso no fluxo atual: `StatusSolicitacao.APROVADA`, `APROVADA_AGUARDANDO_ATA` e `CANCELADA` (já comentado no código).
- A migração `20261012150000_titulo_pedidos_existentes` é de dados: preenche títulos só onde faltam e roda em todo ambiente, inclusive na demonstração, no próximo deploy.

## Código em desuso

- **Endpoints sem chamador no frontend** (alguns mantidos de propósito, ver auditoria anterior): `GET /dashboard`, `GET /atas/alertas`, `PATCH /equipamentos/:id`, `POST /equipamentos/:id/baixa` (baixa manual, sem tela e sem requisito na Wiki), `POST /manutencoes/:id/baixa`, `POST /solicitacoes/:id/vincular-ata` e `DELETE /categorias/tipos/:id/imagem` (a tela de remover imagem foi retirada).
- **CSS:** `.badge-leve`, `.badge-green`, `.badge-yellow`, `.badge-blue` e `.badge-red` perderam o uso quando os selos passaram ao `StatusPill`; com elas, as variáveis `--green*`, `--yellow*`, `--blue*` e `--red*` ficam sem uso, além de `--accent-soft` e `--rel-borda`. Há 14 classes no TSX sem regra de estilo (marcadores; inofensivo).
- **Local:** o `.env` ainda tem `ANTHROPIC_API_KEY=` (módulo removido, arquivo não versionado) e existe uma pasta vazia `scratchpad/` na raiz.
- Sem dependências sem uso, sem exportações ou arquivos órfãos e sem variáveis não usadas (`tsc --noUnusedLocals` limpo nos dois lados).

## Testes

- **Backend:** `estoque.importacao.service.ts` 12%, `categorizacao.ts` 33%, `notificacao.service.ts` 56%, `error.ts` 50%. A importação de estoque é área sensível e quase não tem teste.
- **Frontend:** formulários de usuário, unidade, categoria e tipo com cobertura de 1% a 4%, e o `ArquivoProtegido` (download autenticado) com 7%. Não há teste de matriz de permissões por perfil nem teste de ponta a ponta.
- Os testes com PostgreSQL real existem só para as mensagens não lidas e não rodam na CI (precisa de `TEST_DATABASE_URL`); a concorrência de estoque e de ata continua só com Prisma mockado (item 3 da auditoria anterior).

## Documentação

| Documento | Problema | Ação |
|---|---|---|
| `SECURITY.md` | Diz que dependências de produção não têm vulnerabilidades conhecidas, mas o `multer` está depreciado (S1). | Corrigir a frase depois de atualizar o `multer`. |
| `documentation/wiki/Arquitetura.md` | O modelo de dados está defasado: "quatro tipos" de solicitação (são cinco); tipos de unidade "UBS, UME, CAC ou GALPAO" (o enum tem nove); ata "decrementada a cada aprovação" (agora é no lançamento do pedido no Branet); faltam `estoque_galpao`, `movimentacao_estoque`, `mensagem_chat`, `conversa_leitura`, `configuracao_sistema` e `notificacao`. | Reescrever a seção. |
| `documentation/wiki/Requisitos-Funcionais.md` e `Casos-de-Uso.md` | **RF30, RF37, UC18 e a persona do Galpão** descrevem ações do Galpão no fluxo de solicitações (registrar entrada com tombamento, confirmar despacho) que não existem mais: nenhuma rota de solicitação aceita o perfil `GALPAO`. **RF29** ainda diz "vinculando a aprovação a uma ata". **RF36** (estoque interno e Branet separados, com tela) não está implementado. A baixa manual (`POST /equipamentos/:id/baixa`) não tem requisito. | Revisar com o cliente e ajustar ou retirar. |
| `documentation/wiki/Deploy-e-Instalação.md` | Diz que a API expõe `GET /api/metrics`, mas o Nginx devolve 404 (só `api:3333/metrics`, na rede interna). Diz que a API fica na porta 3333, mas ela é publicada só em `127.0.0.1`. Não cita `GRAFANA_PASSWORD`. Não avisa que o seed usa senha fixa. | Corrigir os três pontos. |
| `documentation/wiki/Home.md` | Índice diz RF01–RF44; já são RF01–RF46. | Atualizar. |
| `AGENTS.md` | O mapa de acesso diz que Atas são do Gestor de Patrimônio, mas o backend deixa o Gestor de Manutenção e o Galpão lerem (S2) e o Galpão editar categorias e tipos (S10). A lista de componentes reutilizáveis não cita `MiniaturaItem`, `LogoSistema` nem `ContagemNaoLidas`. | Ajustar junto com as correções de S2 e S10. |
| `README.md` | O trecho do seed não avisa que a senha é fixa e que é só para demonstração. | Acrescentar o aviso. |
| `documentation/reviews/2026-10-09-auditoria-inicial.md` | Números do baseline antigos (213 e 54 testes) e itens 16, 21 e 9 ainda pendentes. | Marcar como superado por este relatório. |
| `DESIGN-SYSTEM.md`, `CONTRIBUTING.md` | Conferidos e coerentes com o código atual. | — |

## Ordem sugerida

1. **Já:** S1 (`multer` 2.x), S2 e S3 (permissões por perfil e serialização para a Unidade) com teste de matriz, e a migração que corrige a chave estrangeira.
2. **Em seguida:** S4 (sessão e impersonação auditada), S5 (validação de consultas), S6 e S7 (infraestrutura e CI).
3. **Depois:** documentação (Wiki, SECURITY, AGENTS), remoção do que está sem uso e testes da importação de estoque e dos formulários.
4. **Quando fizer sentido:** paginação no servidor (S11), S8, S9, S10 e S12.
