# Passagem para a equipe de TI

Este documento descreve como o SGP funciona hoje, com o código hospedado no GitHub, e o que a TI da Prefeitura precisa decidir ou configurar ao levar o projeto para o GitLab. Ele complementa a Wiki (`documentation/wiki/`), que tem os requisitos, a arquitetura e as instruções de instalação, e o `AGENTS.md`, que reúne as regras de domínio e de segurança.

Itens marcados com **[confirmar]** não aparecem no código e dependem de informação de quem implantou o ambiente.

## 1. Visão geral da arquitetura

Quatro containers, orquestrados pelo `docker-compose.yml`:

| Serviço | O que é | Observação |
|---|---|---|
| `db` | PostgreSQL 16 | Dados no volume `pgdata`. Porta não publicada no host. |
| `api` | Node.js 22, Express, Prisma | Porta 3333, publicada só em `127.0.0.1`. |
| `web` | Nginx com o frontend React compilado | Porta `WEB_PORT`. Encaminha `/api/*` para a API (removendo o prefixo) e `/grafana/*` para o Grafana. |
| `prometheus` e `grafana` | Observabilidade (profile `observability`) | Opcionais. O Grafana exige `GRAFANA_PASSWORD`. |

Pontos a considerar:

- **HTTPS não é feito pelo projeto.** O Nginx do container escuta só em HTTP (porta 80). O certificado e o domínio precisam ser tratados por um proxy ou balanceador na frente. A API usa `trust proxy = 1`, então deve haver exatamente um proxy entre o usuário e o Nginx do container. **[confirmar]** o que faz esse papel na demonstração hoje.
- **Uploads** (anexos, laudos, fotos) ficam no volume `api-uploads`. Fazem parte do backup tanto quanto o banco.
- **Migrações do banco** rodam sozinhas toda vez que a API inicia (`prisma migrate deploy`). Migração publicada nunca é editada: mudanças entram como migração nova.
- **Jobs diários** rodam dentro do processo da API (`backend/src/server.ts`, `node-cron`): às 06:00 fecha solicitações pendentes por prazo de 7 dias, e às 06:10 dá como resolvidos os chamados civis sem resposta da Unidade em 7 dias. Se a API for escalada para mais de uma instância, cada instância executaria os jobs. Hoje há uma só.
- **Métricas** em `/metrics` são internas: o Nginx devolve 404 para `/api/metrics` e só o Prometheus coleta direto da API.

## 2. Como o pipeline funciona hoje

Arquivo: `.github/workflows/ci.yml` (GitHub Actions). Roda em push e pull request para `main`.

**Job 1: Qualidade e Testes** (em runner do GitHub, `ubuntu-latest`). Nesta ordem:

1. Node.js 22 e `npm ci` no backend.
2. `prisma generate`.
3. ESLint do backend (com `eslint-plugin-security`).
4. Build TypeScript do backend.
5. `npm audit --omit=dev --audit-level=high` no backend.
6. Testes do backend com cobertura (mínimo 75% de linhas).
7. `npm ci`, ESLint e `npm audit` do frontend.
8. Testes do frontend com cobertura (mínimo 25%) e build.
9. Cobertura publicada como artefato.
10. SonarCloud, só se existir o secret `SONAR_TOKEN`.

Para reproduzir em outro CI, estes são os comandos (também listados no `AGENTS.md`). Qualquer CI com Node 22 e Docker os executa.

**Job 2: Entrega demonstração** (só em push na `main`, depois do Job 1). Roda num **runner self-hosted** com a label `demo`, instalado em uma instância AWS. No servidor, o pipeline:

1. Entra em `/app/gestao-patrimonio` e roda `git pull origin main`.
2. Valida que `POSTGRES_PASSWORD` só tem letras, números e `. _ ~ -` (a senha entra na URL do banco).
3. Descarta variáveis vazias, para que valha o `.env` do servidor ou o padrão do Compose.
4. Roda `docker compose build` e `docker compose --profile observability up -d`.
5. Confere `GET /api/health` e `GET /grafana/api/health`.

O deploy de **produção** (VM da Secretaria, runner com label `producao`) foi removido do workflow enquanto a VM não existe. O texto do job está no histórico do Git (`git log -S "deploy-prod"`).

Para levar ao GitLab: o equivalente é um `.gitlab-ci.yml` com um estágio de testes (os comandos acima) e um estágio de deploy num runner com acesso ao servidor e ao Docker. O `.github/workflows/ci.yml` pode ser removido depois da migração, ou mantido só como referência.

## 3. Variáveis e segredos

A lista completa, com descrição e valores padrão, está em `.env.example` e em `documentation/wiki/Deploy-e-Instalação.md`. No GitHub, ficam em **Settings › Environments › demonstracao**. No GitLab, o lugar equivalente é **Settings › CI/CD › Variables**, marcando os segredos como *masked* e *protected*, com escopo por ambiente.

Segredos (nunca no repositório):

| Nome | Finalidade |
|---|---|
| `JWT_SECRET` | Assina a sessão. Mínimo de 32 caracteres em produção (a API não inicia sem). Trocar o valor desloga todos. |
| `POSTGRES_PASSWORD` | Senha do banco. Veja a observação sobre volume existente abaixo. |
| `OIDC_CLIENT_SECRET` | Segredo do client no Keycloak. |
| `SMTP_PASS` | Senha do SMTP institucional. |
| `GRAFANA_PASSWORD` | Senha do admin do Grafana. Sem ela o container não sobe. |
| `SONAR_TOKEN` | Opcional. Análise de qualidade. |

Variáveis comuns: `POSTGRES_USER`, `POSTGRES_DB`, `WEB_PORT`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, `OIDC_POST_LOGOUT_URI`, `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM`, `GRAFANA_URL`, `PROMETHEUS_RETENTION`.

**Armadilha do banco:** o PostgreSQL só lê usuário, senha e nome do banco quando o volume é criado. Em servidor novo, defina os três antes do primeiro deploy. Em servidor com banco já em uso, troque a senha dentro do banco antes de mudar o segredo, ou a API perde a conexão. O passo a passo está na Wiki, seção "Credenciais do banco".

## 4. Login (Keycloak)

- O SGP autentica pelo Keycloak da Prefeitura (OIDC, Authorization Code + PKCE, feito no backend) e emite o próprio JWT. Não há login por senha, e o SGP não guarda senhas.
- O client usado hoje no `.env.example` é `sgp-saude`, no realm `pmj`. **[confirmar]** se a TI reaproveita esse client ou cria outro.
- A URL de retorno cadastrada no client precisa ser **idêntica** a `OIDC_REDIRECT_URI` (formato `https://<domínio>/api/auth/callback`). O mesmo vale para `OIDC_POST_LOGOUT_URI`. Mudar de domínio exige atualizar o client.
- O Keycloak não fornece papéis. Quem entra pela primeira vez é achado pelo e-mail (se já cadastrado) ou nasce como `SEM_ACESSO`. Um usuário com `USUARIOS_ADMINISTRAR` dá o perfil e as permissões em Configurações › Usuários.
- **O primeiro Administrador** precisa existir para começar a dar perfis. Num ambiente novo, ele vem do seed (`backend/prisma/seed.ts`, dados demonstrativos) ou de um cadastro direto no banco. **[confirmar]** como foi feito na demonstração e definir o procedimento para produção. O seed não deve ser usado em produção.

## 5. Dependências externas

| Dependência | Uso | Observação |
|---|---|---|
| Keycloak da Prefeitura | Login | Obrigatório. A API não inicia em produção sem as cinco variáveis `OIDC_*`. |
| SMTP institucional | Avisos por e-mail | Opcional (`SMTP_ENABLED`). O e-mail nunca leva o texto de mensagens. |
| SonarCloud | Análise de qualidade | Aponta para uma conta pessoal (`sonar-project.properties`). A TI deve trocar para o Sonar deles ou remover o passo. |
| Docker Hub | Imagens `postgres`, `prom/prometheus`, `grafana/grafana`, base do Node e do Nginx | Se o servidor não tiver internet, é preciso um registro interno. **[confirmar]** |
| npm | Dependências | Idem: pode exigir espelho interno. |

## 6. O que a TI precisa providenciar

1. Um servidor com Docker e Docker Compose, e um proxy com HTTPS e domínio na frente do container `web`.
2. Um client no Keycloak para o SGP, com as URLs de retorno do ambiente.
3. Os segredos e variáveis da seção 3 cadastrados no GitLab (ou no `.env` do servidor).
4. Um runner do GitLab com Docker, ou outro mecanismo de deploy.
5. **Backup** do banco e do volume `api-uploads`. O projeto não faz backup: `docker compose down -v` apaga tudo. Definir frequência, destino e teste de restauração.
6. Um responsável por atualizar dependências e vulnerabilidades (`npm audit`), e por aplicar atualizações do Node (versão fixada em `.nvmrc`).
7. Troca dos links do GitHub no `README.md` e na Wiki. A Wiki publicada no GitHub é separada do repositório; a cópia versionada está em `documentation/wiki/`.

## 7. Pendências e riscos conhecidos

- **"Entrar como" (impersonação)** está liberado para qualquer usuário autenticado que tenha perfil, e assume qualquer conta marcada como "Usuário de teste". É uma decisão temporária, válida só enquanto houver dados de teste. **Antes de entrar com dados reais, restringir ao Administrador ou remover** (`backend/src/modules/auth/auth.service.ts`).
- O **seed** é demonstrativo. Seus usuários e dados não servem para produção.
- **A medição** (preparar e conferir) ainda não existe. As permissões `MANUTENCAO_MEDICAO_PREPARAR` e `_CONFERIR` estão no catálogo, mas não bloqueiam nada.
- Na manutenção de equipamento, o que fazer quando o item **não está na unidade** ainda não foi definido.
- Prioridade, SLA e painel gerencial do chamado civil existem. Natureza do serviço, medição e pagamento são fases futuras (RF67).
- As permissões vão no JWT (sessão de 12 h): mudar a permissão vale no próximo login.
- Os testes do backend usam Prisma mockado. Há duas suítes que exigem PostgreSQL real e ficam puladas sem ele. Mudanças de transação, constraint ou concorrência precisam rodá-las.
- Um teste do frontend (`QrCode.test.tsx`) falhou uma vez quando a suíte inteira rodou em paralelo, e passou nas execuções isoladas. Pode ser instável.
- O bundle do frontend tem cerca de 560 kB. Dá para dividir por rota.
- Há duas auditorias de segurança em `documentation/reviews/` e o `SECURITY.md`. Leia antes de mudanças nessa área.

## 8. Rotina de manutenção

| Tarefa | Como |
|---|---|
| Rodar tudo localmente | Comandos da seção "Comandos obrigatórios" do `AGENTS.md` (lint, build, `test:coverage`, `audit`). |
| Subir o ambiente | `cp .env.example .env`, ajustar e `docker compose up -d --build`. |
| Criar migração | Alterar `backend/prisma/schema.prisma` e gerar a migração nova. Nunca editar uma já publicada. |
| Ver logs | `docker compose logs -f api`. |
| Saúde | `GET /api/health` e, com observabilidade, `GET /grafana/api/health`. |
| Painel | Grafana em `/grafana/`, painel "SGP — API". |

## 9. Onde está cada informação

| Assunto | Arquivo |
|---|---|
| Regras de domínio, perfis, permissões e invariantes | `AGENTS.md` |
| Requisitos e casos de uso | `documentation/wiki/Requisitos-Funcionais.md`, `Casos-de-Uso.md` |
| Arquitetura (C4) | `documentation/wiki/Arquitetura.md` |
| Instalação, variáveis e deploy | `documentation/wiki/Deploy-e-Instalação.md` |
| Decisões de interface | `documentation/DESIGN-SYSTEM.md` |
| Roteiro de testes dos fluxos | `documentation/Roteiro-de-Testes-dos-Fluxos.md` |
| Segurança | `SECURITY.md`, `documentation/reviews/` |
