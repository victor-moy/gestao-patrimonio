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

- `OPERADOR` (exibido como **Operador**; o código e o banco usam `OPERADOR`): usuário interno da Secretaria. O perfil sozinho não autoriza nada: cada operador tem **permissões próprias**, atribuídas em Configurações › Usuários por quem tem `USUARIOS_ADMINISTRAR`. O catálogo fica em `backend/src/lib/permissoes.ts` (o frontend tem os mesmos ids em `frontend/src/utils/permissoes.ts`, com grupos e rótulos; um teste confere que não divergem): manutenções (`MANUTENCAO_CONSULTAR`, `_ESCREVER`, `_TRIAR`, `_AVALIAR`, `_VISTORIAR`, `_MEDICAO_PREPARAR`, `_MEDICAO_CONFERIR`, `_FISCALIZAR`), `CONTRATOS_GERENCIAR` (também prestadores e tipos de serviço), `ATAS_GERENCIAR`, `ESTOQUE_GERENCIAR`, `RELATORIOS_VISUALIZAR`, `SOLICITACOES_GERENCIAR`, `INVENTARIO_GERENCIAR`, `CONFIGURACOES_GERENCIAR` e `USUARIOS_ADMINISTRAR`. Rotas usam `permitirCom(permissão, ...outrosPerfis)` e, em rotas abertas a vários perfis, `restringirOperador(...)` (`middlewares/rbac.ts`); nunca `permitir(Perfil.OPERADOR)`. As permissões vão no JWT (sessão de 30 min): mudar a permissão vale no próximo login. A exceção são as rotas de `/usuarios`, que confirmam no banco (`modules/usuarios/administrador.ts`) se o operador continua ativo e com `USUARIOS_ADMINISTRAR`, para que quem perdeu a permissão não a devolva a si mesmo com o token antigo. `MANUTENCAO_VISTORIAR` registra o parecer da vistoria (`POST /:id/registrar-vistoria`, que também aceita `MANUTENCAO_AVALIAR`); `_MEDICAO_PREPARAR` e `_MEDICAO_CONFERIR` ainda não bloqueiam nada, porque a medição não existe; passam a valer quando a função for criada. O sistema recusa tirar `USUARIOS_ADMINISTRAR` do último operador ativo que a tem. A migração deu todas as permissões a quem já era operador. Não há separação de funções automática: a rastreabilidade vem da auditoria, que guarda as permissões antes e depois.
- `UNIDADE`: dados da própria unidade e dos equipamentos temporariamente sob sua guarda.
- `GALPAO`: operações físicas do galpão ao qual o usuário está vinculado.
- `SEM_ACESSO`: quem entrou pelo Keycloak e ainda não recebeu perfil. Cai na tela inicial (Início com alertas e atualizações, sempre vazios). A lista de permissão em `autenticar` (`ROTAS_SEM_ACESSO`) nega todo o resto; o menu mostra só Início.
- `TERCEIRIZADA`: usuário de uma empresa prestadora de serviço, vinculado a um prestador (`prestadorId` no token). Só enxerga manutenções e contratos do próprio prestador, lança orçamento, confirma o fim do reparo e conversa na manutenção. É um perfil externo: o acesso é por **lista de permissão** em `autenticar` (`middlewares/auth.ts`), negado por padrão; qualquer rota nova só fica disponível a ele se for incluída ali de propósito e testada.

Login: o SGP autentica pelo Keycloak da Prefeitura (OIDC, Authorization Code + PKCE, feito no backend em `modules/auth/oidc.service.ts`) e emite o próprio JWT; o Keycloak não fornece papéis. O usuário é vinculado pelo `sub` (`Usuario.keycloakSub`); no primeiro login, quem já existe é encontrado pelo e-mail e quem é novo nasce `SEM_ACESSO`. Não há login por senha: o SGP não guarda senhas (`senhaHash` é legado e opcional). `OIDC_*` são obrigatórias em produção e o `OIDC_CLIENT_SECRET` nunca vai ao repositório.

Nunca confie apenas na ocultação de controles no frontend. Toda leitura e mutação deve ser restringida no backend por RBAC e, quando aplicável, pelo `unidadeId` do token. Para `GALPAO`, o galpão da operação vem sempre do token (nunca do corpo ou da query); só o Administrador escolhe outro galpão.

Manutenção tem dois tipos (`Manutencao.tipo`): `EQUIPAMENTO` e `CIVIL` (problema em unidade, sala ou instalação, sem `equipamentoId`). No civil não há orçamento prévio: o chamado encaminhado fica `AGUARDANDO_EXECUCAO`, o prestador **gera a OS** (`POST /:id/gerar-os`: equipe, dia e escopo; uma por chamado, `OrdemServico`, número `OS-0001`; o chamado passa a `EM_EXECUCAO`, “em rota” para ele; a OS tem versão para imprimir e a assinatura é em papel), lança os serviços e materiais executados, escolhidos na tabela SINAPI (`ItemSinapi`) só com a quantidade, e marca **executado** (`registrar-retorno` com entrada, saída, resultado total/parcial e observação): o chamado vai a `EXECUTADO` (documentação pendente). Aí o prestador envia a **OS assinada** (PDF, `POST /:id/documentos`; só o tipo `OS_ASSINADA` é aceito, o relatório de execução saiu; depois de enviado o documento não se edita); `EXECUTADO` é exibido como **Doc. pendente**; quem tem `MANUTENCAO_FISCALIZAR` pode recusar o documento (o chamado volta a `EXECUTADO` e o prestador envia outro). Com a OS assinada válida o chamado segue para a Unidade (`AGUARDANDO_RETORNO`). O preço é o de tabela com o `descontoPercentual` do item de contrato, congelado na linha, e **o prestador não vê nem altera valores** do chamado civil (preço, desconto, valor do item, custo final e saldo ficam fora da resposta da API para a `TERCEIRIZADA`; a mensagem de saldo excedido também não traz números). O total vira o `custoFinal` e ocupa o saldo do item nesse momento (recusado se exceder). "Problema resolvido" é a confirmação da Unidade (`AGUARDANDO_RETORNO` → `AGUARDANDO_MEDICAO`). Sem resposta em **7 dias corridos** (`aguardandoRetornoEm`), o job diário `resolverRetornosSemResposta` dá o chamado como resolvido (`resolvidoAutomaticamenteEm`, auditoria `RESOLVER_AUTOMATICAMENTE`, sem usuário); só vale para o civil, porque o retorno de equipamento tem confirmação dupla (invariante 6). A **contestação** encerra o atendimento (`CONCLUIDA`, valor liberado do saldo) e abre um subchamado na triagem (`PENDENTE_APROVACAO`, exibido como **Contestado** para todos os perfis enquanto espera a triagem: marca `abertoPorContestacao`, status só de exibição; sem contrato nem prestador, ligado por `reencaminhadoDeId`/`casoId`, com local, categoria, fotos e setores copiados); o prestador anterior não é mantido; o Administrador dá a aprovação final (`AGUARDANDO_MEDICAO` → `CONCLUIDA`, `conferidoMedicaoEm`) ou solicita ajustes (volta à execução, libera o saldo); quando o prestador finaliza de novo após esses ajustes, o chamado volta direto ao Administrador (`AGUARDANDO_MEDICAO`), sem nova confirmação da Unidade; a medição em si ainda não existe. As fotos do chamado civil são protegidas como os anexos de solicitação (download autorizado por unidade ou prestador do contrato).

Abertura do chamado civil: o **tipo de problema** é cadastro (`CategoriaCivil`, Configurações › Chamados civis, `CONFIGURACOES_GERENCIAR`), não mais lista no código. Cada categoria tem **perguntas** (`PerguntaCategoria`), de seletor de opções pré-definidas (`OPCOES`, ao menos duas) ou texto corrido (`TEXTO`), obrigatórias ou não; o backend valida as respostas contra as perguntas ativas (`RespostaChamado` guarda o texto da pergunta da época). Pergunta que sai da lista fica inativa, nunca é apagada. Categoria usada em chamado só se desativa. Na abertura a tela mostra os chamados civis abertos da mesma unidade e categoria (`GET /manutencoes/civil/abertos`) e deixa **acrescentar** o problema a um deles ou somar **outros problemas** ao chamado (`ManutencaoProblema`, descrição e fotos, até 20; `POST /:id/problemas`), só enquanto o chamado ainda não foi ao prestador: `PENDENTE_APROVACAO`, `AGUARDANDO_AVALIACAO_TECNICA`, `AGUARDANDO_VISTORIA` ou `AVALIADO`. Na manutenção de equipamento o solicitante confirma na tela que o item está na unidade (confirmação de interface; o que fazer quando não está ainda não foi definido).

Orçamento prévio do chamado civil (serviço fora da SINAPI ou que o contrato exige aprovar antes): o tipo de serviço tem `exigeOrcamentoPrevio`. Com ele, a triagem manda o chamado civil à avaliação técnica e **nenhum caminho o leva ao prestador** (`concluir-avaliacao`, `encaminhar-avaliado`) sem orçamento aprovado ou dispensa. A avaliação **solicita o orçamento** (`POST /:id/solicitar-orcamento`, com instruções: `AGUARDANDO_ORCAMENTO`, rodada 1, o prestador já enxerga o chamado); o prestador envia o orçamento em **PDF** (`POST /:id/cotacoes`, campo `arquivos`, de 1 a 5 arquivos numa única entrega por rodada; `CotacaoOrcamento` guarda os arquivos, sem fornecedor nem valor, imutáveis; o chamado vai a `ORCAMENTO_REGISTRADO`); `MANUTENCAO_FISCALIZAR` **aprova informando o valor** (`/aprovar-cotacao` com `{ valor }`: `AGUARDANDO_EXECUCAO`, o valor vira `orcamentoValor` e é conferido contra o saldo do item; `cotacaoAprovadaId` aponta o primeiro arquivo da rodada) ou **rejeita com motivo** (`/rejeitar-cotacoes`: volta a `AGUARDANDO_ORCAMENTO` com a rodada seguinte). A publicação no Diário Oficial é feita fora do sistema. Em **risco à vida** a avaliação dispensa o orçamento (`/dispensar-orcamento`, justificativa de ao menos 10 caracteres, guardada em `dispensaOrcamentoMotivo`) e o chamado segue ao prestador. A Unidade não recebe as cotações. O orçamento de equipamento (valor único) segue como era.

Triagem (equipamento ou civil): `PENDENTE_APROVACAO` só tem duas saídas, aprovar (com o item de contrato) ou negar; não existe mais “aguardar providências”. Quem tem `MANUTENCAO_TRIAR` também pode **bloquear** o chamado antes da execução (`BLOQUEADO`, com motivo obrigatório; `statusAntesBloqueio` guarda de onde veio e desbloquear devolve ao mesmo status; equipamento e saldo continuam reservados) e filtrar na lista os chamados **sem interação** (sem mensagem no chat nem ação registrada depois da abertura, `?semInteracao=true`). O tempo parado fica em `tempoBloqueadoSegundos` para o prazo (SLA, ainda inexistente) descontar. Se o serviço do item tem `exigeAvaliacaoTecnica`, a aprovação leva o chamado a `AGUARDANDO_AVALIACAO_TECNICA`: o item (e o equipamento, no de equipamento) já fica reservado, mas sem `contratoId`, então a terceirizada não o enxerga; quem tem `MANUTENCAO_AVALIAR` confere e corrige qualquer campo do chamado (`PATCH /avaliacao`: título, descrição, unidade, setor, equipamento, local, tipo de problema, item de contrato = prestador, orientações para a terceirizada, parecer), prevê materiais SINAPI no chamado civil (`/materiais`, entram como linhas do relatório e o prestador as ajusta) e decide o destino: seguir em análise (só salvar), encaminhar (`concluir-avaliacao`, exige parecer) ou **pedir informações** (`/solicitar-informacoes`: volta a `PENDENTE_APROVACAO` com o motivo em `informacoesSolicitadas` e o item de contrato limpo, para a triagem falar com o solicitante e escolher de novo), **marcar vistoria** (`/marcar-vistoria`: `AGUARDANDO_VISTORIA`, sem ir ao prestador; `/registrar-vistoria` guarda `parecerVistoria` e devolve à avaliação), **aprovar e devolver à triagem** (`/devolver-avaliado`: `AVALIADO`, a fila “já avaliados”; o triador usa `/encaminhar-avaliado`, podendo trocar o item) ou encerrar (`/encerrar`: `ENCERRADO`, `DUPLICADO` ou `UNIFICADO`, os dois últimos com o número do chamado original; status `ENCERRADA`, que libera equipamento e saldo e conta como negada nos relatórios). Negar é só da triagem. Setores são cadastro por unidade, feito dentro do detalhe da unidade em Configurações › Unidades (`CONFIGURACOES_GERENCIAR`). O chamado pode afetar vários setores (`ManutencaoSetor`; `setorIds` na abertura civil e na avaliação): o civil exige ao menos um quando a unidade tem setores (sem setores cadastrados vale o texto livre) e `localAfetado` guarda os nomes em texto para listas e buscas. Sem a exigência de avaliação, o chamado vai direto ao prestador.

Reencaminhamento (manutenção de equipamento ou civil): a `TERCEIRIZADA` do contrato pede com um motivo em texto (`REENCAMINHAMENTO_SOLICITADO`; o `OPERADOR` não pede, só age depois); o Administrador confirma e decide uma vez: novo chamado (nasce em `PENDENTE_APROVACAO`, sem contrato, prestador nem orçamento, ligado ao anterior por `reencaminhadoDeId` e à raiz por `casoId`; o atendimento anterior vira `CONCLUIDA`) ou baixa pelo fluxo existente (a substituição guarda `manutencaoOrigemId`). Um atendimento ativo por caso; decisões concorrentes são recusadas pela condição de status na gravação. A terceirizada só tem na lista de permissão o pedido (`solicitar-reencaminhamento`) e a trajetória, e na trajetória não vê prestadores de outros contratos. Código em `manutencoes.reencaminhamento.ts`.

Mapa de acesso atual (Operador = só com a permissão indicada): Atas — `ATAS_GERENCIAR`; Contratos — `CONTRATOS_GERENCIAR` (quem tem `MANUTENCAO_CONSULTAR` consulta, em leitura; a terceirizada consulta os do próprio prestador); Configurações na interface — usuários `USUARIOS_ADMINISTRAR`, unidades, categorias e tipos de itens, tipos de problema do chamado civil e atendimento `CONFIGURACOES_GERENCIAR`, prestadores e tipos de serviço `CONTRATOS_GERENCIAR`; Relatórios — `RELATORIOS_VISUALIZAR`; Estoque — Galpão e `ESTOQUE_GERENCIAR`; Conversa (chat) — quem já enxerga a solicitação (Administrador, Unidade da própria unidade, Galpão) ou a manutenção (Administrador, Unidade da própria unidade, Terceirizada do contrato); mensagens são imutáveis e o e-mail de aviso nunca inclui o texto. O acesso direto segue essa regra, mas a lista `/conversas` e as mensagens não lidas são filtradas por perfil e unidade: a Unidade vê as da própria unidade, o Galpão as solicitações, e o Administrador só as em que está envolvido (escreveu, criou ou decidiu o pedido), mais a fila dos pedidos pendentes sem decisão. A leitura é por usuário (`LeituraConversa`): cada pessoa só altera a própria.

## Invariantes de domínio

Preserve estas regras em qualquer alteração:

1. Tombamento é único e imutável. A única exceção é o ajuste explicitamente previsto para itens gerados por uma solicitação ainda em `AGUARDANDO_VALIDACAO`.
2. Alterações de status, localização, saldo ou estoque que dependem umas das outras devem ocorrer na mesma transação.
3. Estoque e saldo de ata nunca podem ficar negativos, inclusive sob requisições concorrentes. Prefira atualização condicional no banco (`updateMany` com `quantidade/saldo >= valor` e checagem de `count`); uma leitura seguida de `decrement` não é proteção suficiente. O saldo da ata só é consumido no lançamento do pedido no Branet; ao vincular, o saldo disponível já desconta o que está comprometido em outras solicitações `RESERVADO` (linha da ata travada com `FOR UPDATE`). No item de contrato o saldo só é consumido no orçamento (ou no custo final), e é nesse momento que é conferido: a escolha do item na triagem não é bloqueada por saldo; `custoFinal` zero não libera saldo. O item de contrato é escolhido na aprovação e não muda depois; o Administrador só nega na triagem.
4. Equipamento em manutenção não pode participar de fluxo incompatível.
5. Empréstimo mantém a unidade proprietária e usa `unidadeTemporariaId` para a detentora.
6. Retorno de manutenção exige confirmação da Unidade e de um operador com `MANUTENCAO_FISCALIZAR`.
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
- Tokens no navegador e a funcionalidade de impersonação são áreas sensíveis ("Entrar como": **qualquer usuário autenticado**, de qualquer perfil, assume qualquer usuário ativo. É uma decisão temporária, válida só enquanto o sistema tiver apenas dados de teste; remova ou restrinja ao Administrador (`auth.service.ts`) antes de entrar com dados reais. O JWT e a auditoria levam `impersonadoPor`); mudanças nelas exigem testes específicos.
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
