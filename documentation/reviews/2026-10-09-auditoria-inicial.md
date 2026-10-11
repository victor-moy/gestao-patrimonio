# Auditoria inicial do projeto — 09/10/2026

## Escopo

Primeira revisão transversal do SGP, cobrindo arquitetura, código, segurança, testes, UX/acessibilidade, desempenho, documentação e operação.

Foram executados lint, build, testes com cobertura, `npm audit` completo e restrito às dependências de produção, inspeção das rotas/serviços e análise da interface no navegador integrado. Não houve pentest contra produção nem teste destrutivo.

## Baseline verificado

| Verificação | Resultado |
|---|---|
| Backend lint e TypeScript | aprovado |
| Frontend lint e build | aprovado |
| Backend | 214 testes, 11 suítes, 87,19% de linhas |
| Frontend | 18 testes, 5 arquivos, 41,61% de linhas |
| Bundle principal do frontend | 731,57 kB; 198,82 kB gzip |
| Dependências backend | 49 alertas totais; 6 em produção |
| Dependências frontend | 25 alertas totais; 2 em produção |

Os testes de backend usam Prisma mockado. Eles validam muito bem serviços e contratos HTTP, mas não exercitam PostgreSQL, constraints, isolamento de transação ou concorrência real.

## Achados prioritários

### P0 — corrigir antes de considerar o sistema pronto para produção

1. **Dependências vulneráveis em produção.** O backend possui alerta crítico transitivo em `proxy-addr`, alto em `nodemailer` e alertas em `express`/`body-parser`/`qs` e `csv-parse`. O frontend possui alertas moderados na linha React Router. Ferramentas de desenvolvimento também incluem alertas críticos em Vitest/Tinypool. Atualizar em lotes pequenos, com testes, evitando `npm audit fix --force` sem revisão.
2. **Isolamento de galpões incompleto.** `resolverGalpaoId` aceita `unidadeId` informado no corpo antes de considerar a unidade do usuário. Um perfil `GALPAO` pode tentar operar o estoque de outro galpão. O backend deve ignorar o campo para esse perfil e sempre usar `req.usuario.unidadeId`; somente o Gestor pode selecionar outro galpão. O mesmo princípio deve cobrir listagem e alteração de movimentações.
3. **Saldo e estoque vulneráveis a corrida.** Há padrões de “ler, validar e depois decrementar”. Duas requisições simultâneas podem aprovar ou retirar com base no mesmo saldo. Use `updateMany` condicional (`quantidade >= X`/`saldo >= X`), constraint no banco e verificação de `count`, ou isolamento/lock apropriado. Adicione testes concorrentes com PostgreSQL real.
4. **Ata pode ser comprometida acima do saldo.** `vincularAta` valida o saldo, mas só o desconta no lançamento no Branet. Várias solicitações podem ficar `RESERVADO` contra o mesmo valor e o consumo posterior usa `Math.max(0)`, ocultando a insuficiência. Modelar saldo reservado versus consumido ou reservar atomicamente na vinculação.
5. **Recuperação de senha é apenas visual.** A tela confirma “E-mail enviado” sem chamar a API nem enviar mensagem. Isso cria falsa expectativa e não oferece recuperação real. Implementar tokens de uso único com expiração ou remover/rotular a função até existir.

### P1 — segurança e confiabilidade

6. **Uploads são públicos e confiam no MIME declarado.** `/uploads` é servido antes da autenticação, e a validação usa apenas `file.mimetype`. Validar assinatura/magic bytes, armazenar fora da raiz pública, autorizar downloads e aplicar `Content-Disposition`/`X-Content-Type-Options` adequados.
7. **Ausência de rate limiting.** Login, impersonação, upload/importação e assistente de IA não têm limites de frequência. Adotar limites por IP/usuário, com atenção à configuração correta de proxy.
8. **Segredo JWT possui fallback inseguro.** `JWT_SECRET` cai para `dev-secret`. O Docker exige segredo, mas uma execução direta de produção pode iniciar insegura. Validar ambiente no boot e falhar em produção quando estiver ausente ou fraco.
9. **Sessões sensíveis no `localStorage`.** Tanto o token normal quanto o token mestre de impersonação ficam acessíveis a qualquer XSS. Avaliar cookie `HttpOnly`, `Secure`, `SameSite`, rotação/refresh e sessão de impersonação curta com identidade do ator incorporada e auditada em cada ação.
10. **CORS irrestrito.** `cors()` aceita qualquer origem. Definir allowlist por ambiente. Isso não substitui a revisão do modelo de sessão.
11. **Assistente sem limites de entrada/custo.** O array de mensagens e cada `content` não possuem máximos. Limitar histórico, caracteres, frequência e orçamento. Formalizar quais dados municipais podem ser enviados ao provedor e evitar persistência desnecessária no navegador.
12. **CI não bloqueia vulnerabilidades de produção.** Adicionar verificação de dependências depois de reduzir o baseline. Considerar Dependabot e varredura SAST/secret scanning.

### P2 — UX, acessibilidade e manutenção

13. **Modais sem gerenciamento completo de foco.** `Modal` e Configurações não declaram `aria-modal`, não contêm o foco, não fecham por `Escape` e não devolvem o foco ao acionador.
14. **Elementos não semânticos clicáveis.** Há linhas de tabela, cabeçalhos, cartões e artigos com `onClick`. Alguns não possuem teclado, papel ou nome acessível equivalentes.
15. **Falhas silenciosas.** Diversas consultas usam `.catch(() => {})`, deixando listas vazias sem explicar indisponibilidade. Padronizar carregamento, vazio, erro e tentativa novamente.
16. **Paginação apenas no cliente.** Listagens principais carregam todos os registros do backend e paginam localmente. Isso conflita com metas de desempenho e tende a degradar com a base real.
17. **Frontend monolítico.** `Configuracoes.tsx`, `Relatorios.tsx`, `Solicitacoes.tsx` e `NovaSolicitacao.tsx` concentram muitas responsabilidades. Extrair gradualmente seções, formulários, hooks de consulta e máquinas de estado do fluxo.
18. **Bundle sem divisão por rota.** O artefato principal excede o alerta de 500 kB do Vite. Usar `React.lazy`, chunks por página e carregamento sob demanda de gráficos/configurações.
19. **Google Fonts como dependência externa — corrigido nesta revisão.** A interface passou a usar a pilha nativa do sistema, eliminando a chamada externa e mantendo funcionamento consistente na rede interna.
20. **Cobertura desigual no frontend.** Estoque, Manutenções e Configurações têm cobertura praticamente nula. Priorizar ações críticas e estados de erro, não apenas elevar o percentual global.
21. **Ausência de E2E e testes reais de banco.** Adicionar uma camada pequena com PostgreSQL descartável e fluxos E2E por perfil.
22. **Documentação divergente.** Partes da Wiki ainda descrevem quatro tipos de solicitação, enquanto o código possui cinco, e chamam a expiração fixa do JWT de expiração por inatividade. Manter requisitos, casos de uso e implementação sincronizados.

## Pontos positivos

- Organização modular clara no backend e tipagem estrita.
- Validação de entrada com Zod e mensagens de domínio com `AppError`.
- RBAC centralizado e filtros adicionais para dados de Unidade.
- Uso consistente de transações e auditoria em muitos fluxos críticos.
- Cobertura backend acima da meta, com bom volume de casos de regra de negócio.
- Interface responsiva, temas claro/escuro e componentes reutilizáveis já presentes.
- Deploy reproduzível por containers, healthcheck e métricas Prometheus.
- Assistente de IA reutiliza funções determinísticas de relatório em vez de gerar números livremente.

## Sequência recomendada

1. Atualizar dependências vulneráveis e adicionar testes de regressão.
2. Corrigir autorização por galpão, proteção de uploads, segredo JWT e rate limiting.
3. Tornar saldo/estoque atomicamente seguros e validar com PostgreSQL real.
4. Implementar ou remover recuperação de senha simulada.
5. Corrigir fundação de acessibilidade: modais, teclado, regiões de status e tratamento de erros.
6. Adicionar paginação no backend e divisão de bundle por rota.
7. Cobrir Estoque, Manutenções e Configurações; depois introduzir E2E por perfil.
8. Refatorar páginas grandes incrementalmente e atualizar a Wiki.

## Critério sugerido de conclusão

- zero vulnerabilidade crítica/alta conhecida em dependências de produção;
- nenhum acesso cruzado entre unidades ou galpões;
- saldo e estoque protegidos contra concorrência;
- fluxos críticos cobertos em PostgreSQL real e ao menos um E2E por perfil;
- modais e ações principais navegáveis por teclado;
- erros de rede sempre visíveis e recuperáveis;
- documentação funcional consistente com os estados e perfis implementados.

---

## Atualização de remediação — 09/10/2026 (segunda passada)

Estado dos achados depois da revisão de código morto, segurança, refatoração e documentação. Baseline atual: backend 213 testes (85% de linhas), frontend 54 testes (70% de linhas), lint e build aprovados nos dois lados; `npm audit --omit=dev` com **0 vulnerabilidades** em backend e frontend.

| # | Achado | Situação |
|---|---|---|
| 1 | Dependências vulneráveis em produção | **Corrigido.** `express/qs/proxy-addr`, `nodemailer` 10, `csv-parse` 7 e `react-router-dom` 7 atualizados. Frontend sem alertas (incluindo ferramentas: Vite 7, Vitest 5, typescript-eslint 8). Backend ainda tem alertas **apenas em ferramentas de teste** (cadeia do Jest 29: `braces`, `sprintf-js`), sem correção publicada. |
| 2 | Isolamento de galpões | **Corrigido.** `GALPAO` usa sempre o galpão do token (corpo/query ignorados) para entrada, saída, importação e listagem; endpoints de movimentações sem uso e sem filtro foram removidos. |
| 3 | Corrida em saldo/estoque | **Corrigido no código**: saída, reserva de estoque e consumo de ata usam débito condicional (`updateMany` com `>=` e checagem de `count`). Coberto por testes com Prisma mockado; **ainda falta teste com PostgreSQL real** para provar a concorrência. |
| 4 | Ata comprometida acima do saldo | **Corrigido.** O vínculo trava a linha da ata (`FOR UPDATE`), desconta o valor já comprometido em outras solicitações `RESERVADO` e o lançamento no Branet falha com 422 se o saldo não cobre (sem `Math.max(0)`). Não foi criado campo separado de saldo reservado. |
| 5 | Recuperação de senha simulada | **Corrigido.** A simulação foi removida: não há mais "Esqueceu a senha?"; o Gestor de Patrimônio redefine a senha em Configurações › Usuários › Nova senha. Recuperação por e-mail com token continua sendo uma evolução possível. |
| 6 | Uploads públicos / MIME | **Corrigido em grande parte.** Anexos e laudos exigem autenticação e respeitam a unidade; só imagens do catálogo são públicas; assinatura (magic bytes) validada; nomes validados contra *path traversal*. Os arquivos ainda ficam em volume sob o diretório da aplicação. |
| 7 | Rate limiting | **Corrigido** para login (IP + e-mail e teto por IP), impersonação e importações. Implementação em memória: vale para uma instância da API. |
| 8 | Fallback do segredo JWT | **Corrigido.** Em produção a API não inicia sem `JWT_SECRET` com 32+ caracteres. |
| 9 | Tokens no `localStorage` | **Pendente.** Avaliar cookie `HttpOnly` e sessão de impersonação curta com ator auditado. |
| 10 | CORS irrestrito | **Corrigido.** Allowlist em `CORS_ORIGINS`; sem configuração, nenhuma origem externa em produção. |
| 11 | Assistente de IA sem limites | **Removido.** Módulo, rota, testes, dependência `@anthropic-ai/sdk` e variável de ambiente foram eliminados junto com o chat da interface. |
| 12 | CI sem gate de vulnerabilidades | **Corrigido.** O CI executa `npm audit --omit=dev --audit-level=high` e o build do backend. |
| 13 | Modais sem foco | **Resolvido.** O sistema não tem mais modais (Configurações virou páginas e o seletor "Entrar como…" virou um ícone na lista de usuários); confirmações e erros usam `window.confirm`/`window.alert`. |
| 14 | Elementos clicáveis não semânticos | **Corrigido.** Restam apenas fundos de modal/menu (fechamento por mouse, com `Escape` e botão equivalentes). |
| 15 | Falhas silenciosas | **Corrigido.** Nenhum `.catch(() => {})` restante no frontend. |
| 16 | Paginação só no cliente | **Pendente** (listas ainda carregam tudo e paginam no navegador). |
| 17 | Frontend monolítico | **Parcial.** `Configuracoes.tsx` (1.100 linhas) virou páginas e componentes reutilizáveis e `Relatorios.tsx` (970 linhas) foi dividido em um arquivo por relatório. Continuam grandes: `solicitacoes.service.ts` (~1.250 linhas), `SolicitacaoDetalhe.tsx` (~820), `ManutencaoDetalhe.tsx` e `NovaSolicitacao.tsx`. |
| 18 | Bundle sem divisão | **Parcial.** O bundle principal caiu de 731 kB para ~376 kB (menos código e dependências), abaixo do alerta de 500 kB, mas ainda sem `React.lazy` por rota. |
| 19 | Google Fonts | Corrigido na revisão anterior. |
| 20 | Cobertura do frontend | **Melhorou** (41% → 70% de linhas), com testes de Estoque, Manutenções, Atas, Contratos e Configurações. |
| 21 | Sem E2E / PostgreSQL real | **Pendente.** |
| 22 | Documentação divergente | **Corrigido.** Wiki, `DESIGN-SYSTEM.md`, `AGENTS.md`, `SECURITY.md`, `.env.example` e README atualizados (cinco tipos de solicitação, sessão de duração fixa, relatórios, saldo de ata, Configurações, Atas e Contratos). |

### Limpeza de código morto nesta passada

- Backend: módulo `assistente`; endpoints de relatório sem uso (`detalhe-unidade`, `itens-estoque/detalhe`, `itens-por-unidade`); `dashboard/resumo`; movimentações de estoque sem uso; KPI "Duração média" e funções auxiliares órfãs.
- Frontend: `SeletorEquipamento`, `SeletorTipoEquipamento`, `TextoTruncado`, o modal de Configurações, 27 ícones, 4 tipos e 3 helpers sem uso, e ~480 seletores CSS sem uso (`styles.css` caiu de ~2.900 para ~1.300 linhas).
- Mantidos por vincularem requisitos ainda documentados, embora sem tela: `GET /dashboard` (RF34 original), `GET /atas/alertas`, `PATCH /equipamentos/:id`, `POST /equipamentos/:id/baixa`.

### Próximos passos sugeridos

1. Testes com PostgreSQL real para estoque, ata e transições de solicitação concorrentes.
2. Cookie `HttpOnly` e revisão do modelo de impersonação (item 9).
3. Paginação e filtros no backend (item 16) e `React.lazy` por rota.
4. Dividir `solicitacoes.service.ts` por fluxo e extrair seções de `SolicitacaoDetalhe.tsx`.


---

## Revisão de 11/10/2026 (terceira passada)

Baseline: backend 262 testes (86% de linhas), frontend 82 testes, lint e build aprovados; `npm audit` de produção com 0 vulnerabilidades nos dois lados (backend ainda com alertas só na cadeia do Jest).

**Código morto removido:** hook `useAlinhamentoDropdown`; dependência `recharts` (não era mais importada) e o código de teste/CSS que a acompanhava; exports sem uso no backend.

**Segurança:**
- Nginx do frontend passou a enviar CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`, esconde a versão do servidor, não deixa o `index.html` em cache e não expõe `/api/metrics`. Validado no Chrome: o app, o QR Code e a abertura de PDF por blob funcionam sob a CSP, sem violações.
- A porta 3333 da API só é publicada no loopback.
- Revisados sem achados: SQL bruto (apenas `SELECT 1` e o `FOR UPDATE` da ata, ambos parametrizados), uso de HTML dinâmico (nenhum), logs (sem dados sensíveis) e as rotas novas (conversa, atendimento, número sequencial).

**Boas práticas:** `solicitacoes.service.ts` (1.273 linhas) foi dividido em consulta, criação, decisão, execução e peças comuns, sem mudar comportamento (262 testes verdes). A seleção de equipamento na abertura de manutenção deixou de listar itens emprestados que o backend recusaria.

**Pendente (decisão de implantação):**
- O container da API ainda roda como root; trocar para um usuário sem privilégios exige acertar a permissão do volume de uploads já existente.
- O token da sessão continua no `localStorage`; usuário desativado mantém o token até expirar (30 min).
- `POSTGRES_PASSWORD` e `GRAFANA_PASSWORD` têm padrão fraco no `docker-compose.yml` (banco não publicado; Grafana só no perfil de observabilidade): defina valores reais em produção.
- Continuam grandes `SolicitacaoDetalhe.tsx` (~815 linhas), `ManutencaoDetalhe.tsx` e `NovaSolicitacao.tsx`.
