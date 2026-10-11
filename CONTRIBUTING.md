# Contribuindo

## Ambiente

Use Node.js 22 e Docker. Instale as dependências com:

```bash
npm ci --prefix backend
npm --prefix backend run prisma:generate
npm ci --prefix frontend
```

Para executar a aplicação completa, siga o `README.md`. Não reutilize banco ou volume de produção em desenvolvimento.

## Antes de abrir um pull request

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend run test:coverage
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:coverage
```

O pull request deve explicar o problema, a solução, como foi validada, impacto em segurança/migração e capturas de tela para mudanças visuais.

Mudanças de regra de negócio devem atualizar testes e a documentação em `documentation/wiki/`. Mudanças no schema Prisma devem criar uma nova migração; migrações já publicadas não devem ser editadas.

Leia também `AGENTS.md` para invariantes do domínio, critérios de UX e cuidados de segurança.
