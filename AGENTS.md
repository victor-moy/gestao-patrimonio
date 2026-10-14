# AGENTS.md

Este arquivo orienta qualquer agente que trabalhe neste repositório. Ele se aplica a todo o projeto.

## Objetivo do produto

O Sistema de Gestão de Patrimônio (SGP) atende a Secretaria Municipal da Saúde de Joinville. Ele centraliza inventário, manutenção, solicitações, estoque de galpões, atas, contratos e relatórios de equipamentos patrimoniais.

O domínio é administrativo e auditável. Integridade de dados, autorização por perfil, rastreabilidade e mensagens compreensíveis têm prioridade sobre atalhos de implementação.

## Stack e estrutura

- `frontend/`: React 18, Vite, TypeScript, React Router e `qrcode` (etiquetas). Os gráficos dos relatórios são feitos em CSS, sem biblioteca.
- `backend/`: Node.js, Express, TypeScript, Prisma e PostgreSQL.
- `backend/src/modules/`: rotas e serviços separados por domínio. O serviço de solicitações é dividido por etapa em `solicitacoes.consulta|criacao|decisao|execucao|comum.ts`; `solicitacoes.service.ts` apenas reexporta.
- `backend/prisma/schema.prisma`: fonte de verdade do modelo relacional.
- `backend/prisma/migrations/`: histórico imutável de migrações.
- `documentation/wiki/`: documentação funcional e arquitetural.
- `docker-compose.yml`: API, frontend/Nginx, PostgreSQL e observabilidade opcional.
- `.github/workflows/ci.yml`: qualidade, testes e deploy.

O frontend usa `/api` em produção. O Nginx remove esse prefixo ao encaminhar para a API; as rotas Express não possuem `/api` internamente.

## Perfis e limites de acesso

- `OPERADOR` (exibido como **Administrador**; o código e o banco usam `OPERADOR`): reúne os antigos Gestor de Patrimônio e Gestor de Manutenção — visão global, decisões patrimoniais, ciclo de manutenção, contratos, configurações, estoque e relatórios. Não há separação de funções entre os dois conjuntos: a rastreabilidade vem da auditoria.
- `UNIDADE`: dados da própria unidade e dos equipamentos temporariamente sob sua guarda.
- `GALPAO`: operações físicas do galpão ao qual o usuário está vinculado.
- `TERCEIRIZADA`: usuário de uma empresa prestadora de serviço, vinculado a um prestador (`prestadorId` no token). Só enxerga manutenções e contratos do próprio prestador, lança orçamento, confirma o fim do reparo e conversa na manutenção. É um perfil externo: o acesso é por **lista de permissão** em `autenticar` (`middlewares/auth.ts`), negado por padrão; qualquer rota nova só fica disponível a ele se for incluída ali de propósito e testada.

Nunca confie apenas na ocultação de controles no frontend. Toda leitura e mutação deve ser restringida no backend por RBAC e, quando aplicável, pelo `unidadeId` do token. Para `GALPAO`, o galpão da operação vem sempre do token (nunca do corpo ou da query); só o Administrador escolhe outro galpão.

Manutenção tem dois tipos (`Manutencao.tipo`): `EQUIPAMENTO` e `CIVIL` (problema em unidade, sala ou instalação, sem `equipamentoId`). No civil não há orçamento prévio: o chamado encaminhado fica `AGUARDANDO_EXECUCAO`, o prestador inicia a execução (`EM_EXECUCAO`) e, ao confirmar a finalização, informa os serviços e materiais executados, escolhidos na tabela SINAPI (`ItemSinapi`) sem informar preço: o valor é o preço de tabela com o `descontoPercentual` do item de contrato, congelado na linha. O total vira o `custoFinal` e ocupa o saldo do item nesse momento (recusado se exceder). "Problema resolvido" é a confirmação da Unidade (`AGUARDANDO_RETORNO` → `AGUARDANDO_MEDICAO`; a contestação volta à execução); o Administrador dá a aprovação final (`AGUARDANDO_MEDICAO` → `CONCLUIDA`, `conferidoMedicaoEm`) ou solicita ajustes (volta à execução, libera o saldo); quando o prestador finaliza de novo após esses ajustes, o chamado volta direto ao Administrador (`AGUARDANDO_MEDICAO`), sem nova confirmação da Unidade; a medição em si ainda não existe. As fotos do chamado civil são protegidas como os anexos de solicitação (download autorizado por unidade ou prestador do contrato).

Mapa de acesso atual: Atas — Administrador; Contratos — Administrador (a terceirizada consulta, em leitura, os do próprio prestador); Configurações na interface (usuários, unidades, categorias de itens, tipos de itens, prestadores de serviço, tipos de serviço, escopos) e Relatórios — Administrador; Estoque — Galpão e Administrador; Conversa (chat) — quem já enxerga a solicitação (Administrador, Unidade da própria unidade, Galpão) ou a manutenção (Administrador, Unidade da própria unidade, Terceirizada do contrato); mensagens são imutáveis e o e-mail de aviso nunca inclui o texto. O acesso direto segue essa regra, mas a lista `/conversas` e as mensagens não lidas são filtradas por perfil e unidade: a Unidade vê as da própria unidade, o Galpão as solicitações, e o Administrador só as em que está envolvido (escreveu, criou ou decidiu o pedido), mais a fila dos pedidos pendentes sem decisão. A leitura é por usuário (`LeituraConversa`): cada pessoa só altera a própria.

## Invariantes de domínio

Preserve estas regras em qualquer alteração:

1. Tombamento é único e imutável. A única exceção é o ajuste explicitamente previsto para itens gerados por uma solicitação ainda em `AGUARDANDO_VALIDACAO`.
2. Alterações de status, localização, saldo ou estoque que dependem umas das outras devem ocorrer na mesma transação.
3. Estoque e saldo de ata nunca podem ficar negativos, inclusive sob requisições concorrentes. Prefira atualização condicional no banco (`updateMany` com `quantidade/saldo >= valor` e checagem de `count`); uma leitura seguida de `decrement` não é proteção suficiente. O saldo da ata só é consumido no lançamento do pedido no Branet; ao vincular, o saldo disponível já desconta o que está comprometido em outras solicitações `RESERVADO` (linha da ata travada com `FOR UPDATE`). No item de contrato o saldo só é consumido no orçamento (ou no custo final); `custoFinal` zero não libera saldo. Enquanto aguarda orçamento, o Administrador pode trocar o item ou negar o chamado (o equipamento volta a ativo).
4. Equipamento em manutenção não pode participar de fluxo incompatível.
5. Empréstimo mantém a unidade proprietária e usa `unidadeTemporariaId` para a detentora.
6. Retorno de manutenção exige confirmação da Unidade e do Administrador.
7. Baixa por manutenção cria automaticamente uma solicitação de substituição.
8. Ações críticas precisam de `LogAuditoria`, idealmente na mesma transação da mutação. Se a sessão veio de impersonação, o JWT e o log trazem `impersonadoPor` (o Administrador que assumiu), além do `usuarioId` do alvo.
9. Notificações só devem ser disparadas depois de uma transação bem-sucedida.
10. Erros de domínio devem usar `AppError`; entradas externas devem ser validadas com Zod.
11. Solicitações e manutenções têm `numero` sequencial (SOL-0001 / MAN-0001) gerado pelo banco; ele é imutável, nunca reutilizado e é a referência humana (o `id` UUID segue como chave técnica).

Antes de alterar um fluxo, consulte `documentation/wiki/Requisitos-Funcionais.md` e os testes correspondentes. Se o comportamento acordado divergir da Wiki, atualize código, testes e documentação no mesmo trabalho.

## Comandos obrigatórios

Use Node.js 22, conforme `.nvmrc` e CI.

```bash
# instalação
npm ci --prefix backend
npm --prefix backend run prisma:generate
npm ci --prefix frontend

# backend
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend run test:coverage

# frontend
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:coverage

# dependências usadas em produção
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev
```

O gate atual exige no mínimo 75% de linhas no backend e 25% no frontend. Não reduza metas para fazer uma alteração passar.

## Banco e migrações

- Nunca edite uma migração que já tenha sido publicada.
- Mudanças no schema devem incluir uma nova migração e o Prisma Client regenerado localmente.
- Não execute `prisma migrate reset`, exclusões em massa ou recriação de volumes sem autorização explícita.
- Testes unitários do backend usam Prisma mockado; mudanças de transação, constraint ou concorrência também precisam de teste com PostgreSQL real.
- Seed é somente demonstrativo. Credenciais e dados do seed nunca devem ser tratados como apropriados para produção.

## Backend

- Rotas cuidam de autenticação, autorização, validação e tradução HTTP; regras de negócio complexas ficam nos serviços.
- Faça seleção explícita ao retornar usuários e nunca exponha `senhaHash`.
- Listagens potencialmente grandes devem ter paginação e limites máximos.
- Upload não deve confiar apenas em `mimetype`; valide assinatura do arquivo e aplique autorização também ao download.
- Não introduza segredo com valor padrão em produção. Configuração obrigatória deve falhar cedo.
- Novos endpoints sensíveis precisam considerar rate limiting, auditoria e abuso automatizado.

## Frontend e UX

- Consulte `documentation/DESIGN-SYSTEM.md` antes de alterar layout, navegação, filtros, tabelas, formulários ou hierarquia visual. Ele registra as decisões de UX tomadas (ação primária à direita, cadastros em página própria e não em modal, listas no padrão do Inventário, sem símbolos em botões, histórico recolhido etc.). Se a decisão de UX mudar, atualize esse documento junto com o código e os testes.
- Reutilize os componentes existentes antes de criar outros: `ListaCadastro`, `PaginaCadastro`, `RotaRestrita`, `SelectItem`, `StatusPill` (cor de qualquer status), `CampoAnexo`, `HistoricoRecolhivel`, `ArquivoProtegido`, hooks `useCarga` e `useMensagemTemporaria`. Estilos novos entram em `components/Polaris.css` ou no CSS da própria página; não reintroduza CSS sem uso.
- Cadastros e edições são páginas (`/recurso/novo`, `/recurso/:id`); modais ficam para confirmações e tarefas curtas. Não há toasts de sucesso: a confirmação é a mudança visível na tela. Erros de ação usam `window.alert` (`useAlertaNativo`); falhas de carregamento usam faixa inline com nova tentativa.
- Anexos e laudos são protegidos: nunca use `<a href>`/`<img src>` direto para `/uploads/solicitacoes` ou `/uploads/laudos`; use os componentes de `ArquivoProtegido`.
- Preserve suporte responsivo. O sistema tem um único tema (claro); não reintroduza tema escuro sem decisão explícita.
- Toda operação assíncrona deve ter estado de carregamento, vazio e erro visível; não descarte falhas silenciosamente.
- Ações destrutivas ou irreversíveis exigem confirmação e feedback após conclusão.
- Modais precisam de `aria-modal`, foco inicial, contenção de foco, fechamento por `Escape` e devolução do foco ao acionador.
- Controles clicáveis devem ser elementos semânticos acessíveis por teclado; não use `div`, `tr`, `th` ou `article` com `onClick` sem comportamento equivalente de teclado.
- Mensagens dinâmicas importantes devem usar `role="alert"`, `role="status"` ou região `aria-live` adequada.
- Evite páginas monolíticas. Ao tocar em arquivos grandes, extraia componentes e hooks por responsabilidade, sem reescrita ampla não relacionada.
- Para mudanças visuais, valide desktop e mobile e inclua captura de tela quando o ambiente permitir.

## Segurança e privacidade

- Não registre tokens, senhas, segredos, conteúdo integral de anexos ou dados pessoais desnecessários.
- Qualquer integração que envie dados a terceiros (IA, e-mail, analytics) precisa de decisão explícita: minimize o conteúdo, documente a finalidade e mantenha limites de tamanho e custo. Hoje não há integração de IA no produto.
- Tokens no navegador e a funcionalidade de impersonação são áreas sensíveis (só o Administrador assume outros usuários: a regra fica em `auth.service.ts`, nunca só na tela; o JWT e a auditoria levam `impersonadoPor`); mudanças nelas exigem testes específicos.
- Rode o audit de dependências e descreva vulnerabilidades novas ou remanescentes no PR.
- Consulte `SECURITY.md` e `documentation/reviews/` antes de mudanças de segurança.

## Testes esperados

- Correção de bug: primeiro adicione teste que reproduza a falha.
- Regra de domínio: cubra caminho feliz, transição inválida, perfil indevido e isolamento entre unidades.
- Fluxo de interface: prefira teste pelo papel/nome acessível, não por classe CSS ou detalhe interno.
- Não faça snapshots extensos da interface.
- Não considere mocks do Prisma suficientes para validar constraints, locks ou isolamento transacional.

## Escopo e disciplina de mudanças

- Preserve alterações existentes do usuário e não reformate arquivos sem relação com a tarefa.
- Não renomeie a branch do workspace.
- Não faça push, deploy, merge ou comentário no GitHub sem solicitação explícita.
- Não altere arquivos gerados (`dist`, `coverage`, `*.tsbuildinfo`) nem os versione.
- Registre decisões arquiteturais relevantes em `documentation/`.
- Ao terminar, informe arquivos alterados, comandos executados, resultados e riscos pendentes.
