# Deploy e Instalação

## Pré-requisitos

| Cenário | Requisitos |
|---|---|
| Rodar com Docker (recomendado) | [Docker](https://docs.docker.com/get-docker/) e Docker Compose |
| Rodar sem Docker (desenvolvimento) | Node.js 22+ e um PostgreSQL acessível |

## Variáveis de ambiente

Copie `.env.example` para `.env` na raiz do repositório e ajuste os valores:

| Variável | Descrição | Padrão (`.env.example`) |
|---|---|---|
| `DATABASE_URL` | String de conexão do PostgreSQL usada pelo Prisma | `postgresql://sgp:sgp@localhost:5432/sgp?schema=public` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciais do container do Postgres (Docker Compose) | `sgp` / `sgp` / `sgp` |
| `API_PORT` | Porta em que a API escuta | `3333` |
| `NODE_ENV` | Ambiente da API. Em `production` (imagem Docker) a API exige `JWT_SECRET` forte e não aceita origens CORS externas por padrão | `development` |
| `JWT_SECRET` | Segredo de assinatura dos tokens JWT. **Obrigatório e com no mínimo 32 caracteres em produção** — a API não inicia sem isso (ex.: `openssl rand -hex 32`) | `troque-este-segredo-em-producao` |
| `JWT_EXPIRES_IN` | Duração da sessão (RF04): o token expira após esse tempo e o usuário precisa entrar de novo | `30m` |
| `CORS_ORIGINS` | Origens extras autorizadas a chamar a API pelo navegador, separadas por vírgula. Normalmente vazio: em produção o frontend usa o mesmo domínio (`/api` via Nginx) | vazio |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Configuração do SMTP institucional para notificações por e-mail | ver `.env.example` |
| `SMTP_ENABLED` | Liga/desliga o envio real de e-mail — em dev, deixe `false` para só registrar as notificações | `false` |
| `WEB_PORT` | Porta do container do frontend no host | `8080` |
| `VITE_API_URL` | Só usada em dev local sem Docker; em produção o frontend fala com `/api` via Nginx | `http://localhost:3333` |

O `.env` nunca é versionado (está no `.gitignore`) — segredos reais (JWT, SMTP) não devem ser commitados.

## Onde configurar as variáveis

| Situação | Onde fica a configuração |
|---|---|
| Rodando local com Docker Compose | Arquivo `.env` na raiz (copie de `.env.example`). Nunca é versionado. |
| Deploy automático (GitHub Actions) | No GitHub, em **Settings › Environments**, um ambiente para cada destino (hoje só `demonstracao`; `producao` volta quando o deploy de produção for reativado). Em cada um, valores sensíveis (`JWT_SECRET`, `SMTP_PASS`, e `POSTGRES_PASSWORD`/`GRAFANA_PASSWORD` quando aplicável) vão em **Secrets**; os demais (`WEB_PORT`, `JWT_EXPIRES_IN`, `SMTP_*`...) em **Variables**. Assim produção e demonstração têm segredos e portas próprios. |
| Desenvolvimento sem Docker (`npm run dev`) | Não é preciso definir `JWT_SECRET`: fora de produção a API usa um valor de desenvolvimento. |

O job de deploy copia os segredos e variáveis do GitHub para o ambiente antes de rodar `docker compose`. O que não estiver cadastrado no GitHub é ignorado e vale o `.env` do servidor (se existir) ou o padrão do Compose, então dá para migrar aos poucos.

**`JWT_SECRET` é obrigatório em produção** (a API recusa iniciar sem um valor de pelo menos 32 caracteres). Gere um com `openssl rand -hex 32` e cadastre como secret `JWT_SECRET` no GitHub.

### Credenciais do banco no GitHub

`POSTGRES_USER` e `POSTGRES_DB` ficam em **Variables** e `POSTGRES_PASSWORD` em **Secrets** de cada ambiente. A API monta a URL de conexão a partir deles (não é preciso cadastrar `DATABASE_URL`). A senha só pode ter letras, números e `. _ ~ -` (o deploy recusa outros caracteres, que quebrariam a URL); gere com `openssl rand -hex 24`.

O Postgres só lê usuário, senha e nome do banco na **primeira criação do volume**. Por isso:

- **Servidor novo (banco vazio):** cadastre os três valores no GitHub antes do primeiro deploy.
- **Servidor com banco já em uso (mantendo os dados):** `POSTGRES_USER` e `POSTGRES_DB` devem repetir o que o banco já tem (hoje `sgp` e `sgp`). Antes do deploy, troque a senha dentro do banco para o valor que vai cadastrar: `docker compose exec db psql -U sgp -d sgp -c "ALTER USER sgp WITH PASSWORD '<nova senha>'"`. Só depois cadastre o secret e faça o deploy; se o secret mudar sem a troca no banco, a API perde a conexão.

## Rodando com Docker Compose

```bash
git clone https://github.com/victor-moy/gestao-patrimonio.git
cd gestao-patrimonio
cp .env.example .env   # ajuste os valores, principalmente JWT_SECRET
docker compose up -d --build
```

Isso sobe três containers, conforme o Diagrama C4 de Containers (ver [Arquitetura](Arquitetura)):

- `api` — API REST (Node.js + Express), porta `3333`
- `web` — frontend React servido como estático via Nginx, que também faz proxy de `/api/*` para o container `api` — porta `WEB_PORT` (padrão `8080`)
- `db` — PostgreSQL, com volume persistente (`pgdata`)

As migrações do Prisma (`prisma migrate deploy`) rodam automaticamente toda vez que o container da API inicia, antes de subir o servidor — não é preciso rodar nada manualmente.

Para popular dados de exemplo (usuários de cada perfil, unidades, categorias de equipamento): a imagem final da API só instala `dependencies` (`npm ci --omit=dev`), então o `tsx` usado pelo script de seed não está presente por padrão — instale on-the-fly só para essa execução:

```bash
docker compose exec api sh -c "npm install tsx --no-save && npx tsx prisma/seed.ts"
```

Healthcheck: `GET /api/health` (usado também pelo pipeline de CI/CD para validar o deploy).

### Observabilidade (opcional)

A API expõe métricas no formato Prometheus em `GET /api/metrics`. Os containers de Prometheus e Grafana ficam atrás do profile `observability` do `docker-compose.yml` e **não sobem por padrão**:

```bash
docker compose --profile observability up -d
```

## Rodando sem Docker (desenvolvimento local)

Útil para ter hot-reload no backend e no frontend. O serviço `db` do `docker-compose.yml` não publica porta pro host (só é alcançável pelos outros containers da stack, de propósito — ver seção 6.3 do RFC sobre acesso ao banco restrito à API). Pra desenvolvimento local, suba um Postgres avulso:

```bash
docker run -d --name sgp-db -e POSTGRES_USER=sgp -e POSTGRES_PASSWORD=sgp -e POSTGRES_DB=sgp -p 5432:5432 postgres:16-alpine
```

Backend:

```bash
cd backend
npm install
npx prisma generate
npm run prisma:migrate   # aplica as migrações existentes (prisma migrate deploy)
npm run prisma:seed      # opcional — dados de exemplo
npm run dev               # tsx watch — http://localhost:3333
```

Frontend (em outro terminal):

```bash
cd frontend
npm install
npm run dev   # vite — http://localhost:5180, com proxy de /api para http://localhost:3333
```

## Testes

```bash
# Backend — Jest + Supertest, meta de cobertura: 75% linhas
cd backend
npm run lint
npm run test:coverage

# Frontend — Vitest + Testing Library, meta de cobertura: 25% linhas
cd frontend
npm run lint
npm run test:coverage
npm run build
```

Esses são exatamente os passos executados pelo job "Qualidade e Testes" do CI.

## Deploy automatizado (CI/CD)

Pipeline: [`.github/workflows/ci.yml`](https://github.com/victor-moy/gestao-patrimonio/blob/main/.github/workflows/ci.yml) — GitHub Actions. Não há deploy manual via SSH/FTP.

A cada push ou merge na branch `main`:

1. **Qualidade e Testes** (`ubuntu-latest`) — instala dependências, roda Prisma generate, ESLint (backend com `eslint-plugin-security`) e os testes com cobertura dos dois lados, builda o frontend e publica o relatório de cobertura como artefato. Se configurado o secret `SONAR_TOKEN`, roda também a análise do SonarCloud.
2. Se o passo anterior passar, o job **Entrega demonstração** ([sgp.yomlabs.io](https://sgp.yomlabs.io)) roda num runner **self-hosted** (label `demo`, instalado na instância da AWS usada para avaliação): `git pull`, `docker compose build && docker compose up -d` e healthcheck em `/api/health`.

> O job de **produção** (VM da Secretaria Municipal de Saúde, runner com label `producao`) foi removido do workflow enquanto a VM não está disponível. Para reativá-lo, recupere-o do histórico do Git e cadastre o ambiente `producao` no GitHub.

Para reproduzir o deploy manualmente em um servidor novo (por exemplo, para configurar um runner), os passos são os mesmos da seção "Rodando com Docker Compose" acima.
