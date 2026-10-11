# Sistema de Gestão de Patrimônio

Sistema web para gestão do patrimônio físico da Secretaria Municipal de Saúde de Joinville, centralizando o ciclo de vida dos equipamentos e eliminando a dependência de planilhas manuais e sistemas desconectados.

**Autor:** Victor Moy da Cruz — Engenharia de Software, Católica SC

---

## Documentação

- [RFC v1.0](documentation/RFC.pdf) — visão do produto, problema, benchmark, escopo e objetivos
- [Wiki](https://github.com/victor-moy/gestao-patrimonio/wiki) — requisitos funcionais, casos de uso, diagramas de arquitetura (C4) e instruções de deploy

## Stack

- **Backend**: Node.js + Express + TypeScript + Prisma ORM
- **Frontend**: React + Vite + TypeScript
- **Banco de dados**: PostgreSQL
- **Infra**: Docker Compose (API, frontend/Nginx, PostgreSQL) + GitHub Actions (CI/CD)

## Rodando com Docker Compose (recomendado)

Pré-requisitos: [Docker](https://docs.docker.com/get-docker/) e Docker Compose.

1. Clone o repositório e entre na pasta:

   ```bash
   git clone https://github.com/victor-moy/gestao-patrimonio.git
   cd gestao-patrimonio
   ```

2. Copie o arquivo de variáveis de ambiente e ajuste os valores (principalmente `JWT_SECRET` — veja a tabela completa na [página de Deploy da Wiki](https://github.com/victor-moy/gestao-patrimonio/wiki/Deploy-e-Instalação)):

   ```bash
   cp .env.example .env
   ```

3. Suba os containers:

   ```bash
   docker compose up -d --build
   ```

   As migrações do Prisma rodam automaticamente na inicialização do container da API (`prisma migrate deploy`, antes de subir o servidor).

4. Acesse:

   - Frontend: <http://localhost:8080> (porta configurável via `WEB_PORT` no `.env`)
   - API: <http://localhost:3333>
   - Healthcheck: <http://localhost:8080/api/health>

5. (Opcional) Popule dados de exemplo (usuários, unidades, categorias) — a imagem de produção não inclui as devDependencies, então instala o `tsx` on-the-fly só pra essa execução:

   ```bash
   docker compose exec api sh -c "npm install tsx --no-save && npx tsx prisma/seed.ts"
   ```

## Rodando localmente sem Docker (desenvolvimento)

Pré-requisitos: Node.js 22+ e um PostgreSQL acessível. O `db` do `docker-compose.yml` não expõe porta pro host (só é alcançável pelos outros containers), então pra rodar backend/frontend direto na máquina o mais simples é subir um Postgres avulso:

```bash
docker run -d --name sgp-db -e POSTGRES_USER=sgp -e POSTGRES_PASSWORD=sgp -e POSTGRES_DB=sgp -p 5432:5432 postgres:16-alpine
```

1. Copie e ajuste o `.env` (ver seção acima) — `DATABASE_URL` deve apontar para o Postgres que você for usar.

2. Backend:

   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run prisma:migrate   # aplica as migrações existentes
   npm run prisma:seed      # opcional — dados de exemplo
   npm run dev               # http://localhost:3333
   ```

3. Frontend (em outro terminal):

   ```bash
   cd frontend
   npm install
   npm run dev                # http://localhost:5180, com proxy de /api para o backend
   ```

## Testes

```bash
# Backend — testes + cobertura (meta: 75% linhas)
cd backend && npm run test:coverage

# Frontend — testes + cobertura (meta: 25% linhas)
cd frontend && npm run test:coverage
```

## Contribuição e revisão

- [Instruções para agentes](AGENTS.md)
- [Guia de contribuição](CONTRIBUTING.md)
- [Política de segurança](SECURITY.md)
- [Sistema visual e critérios de UX](documentation/DESIGN-SYSTEM.md)
- [Auditoria inicial do projeto](documentation/reviews/2026-10-09-auditoria-inicial.md)

## Deploy

O deploy é automatizado via GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — não é feito manualmente via SSH/FTP. A cada push/merge na `main`, depois que o job de qualidade (lint + testes + cobertura dos dois lados) passa, dois ambientes são atualizados por runners self-hosted:

- **Produção** — VM da própria Secretaria Municipal de Saúde, rede interna.
- **Demonstração pública** — [sgp.yomlabs.io](https://sgp.yomlabs.io), usada para avaliação.

Detalhes de infraestrutura, variáveis de ambiente e como reproduzir o deploy em um servidor novo estão na [página de Deploy e Instalação da Wiki](https://github.com/victor-moy/gestao-patrimonio/wiki/Deploy-e-Instalação).
