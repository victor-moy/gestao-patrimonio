# Sistema visual e decisões de UX do SGP

Este documento registra a direção visual e as decisões de UX da plataforma. A referência é um painel administrativo no padrão de *resource indexes* do Shopify Polaris: sóbrio, compacto e adequado ao uso diário em operações patrimoniais. Toda tela nova deve seguir estas regras; se uma decisão mudar, atualize este arquivo junto com o código e os testes.

## Princípios

1. **Clareza operacional:** títulos, indicadores, filtros e ações refletem a ordem em que o trabalho é executado.
2. **Hierarquia contida:** peso, espaçamento e contraste antes de sombras, cores ou ornamentos.
3. **Ações previsíveis:** a ação primária é escura e **sempre fica à direita**; secundárias são claras; cores semânticas são reservadas a estados.
4. **Menos informação por vez:** mostrar só o necessário para a decisão; o restante fica recolhido (histórico) ou em linhas compactas.
5. **Sem símbolos decorativos:** botões e rótulos usam só texto (nada de ícones em botões, "+", "✕" ou setas em textos). Ícones ficam na navegação e em controles sem texto (ex.: fechar, expandir).
6. **Acessibilidade por padrão:** foco visível, controles semânticos, nomes acessíveis e estados assíncronos anunciados (`role="alert"` / `role="status"`).

## Fundamentos

Tokens globais em `frontend/src/styles.css`; padrões das telas autenticadas em `frontend/src/components/Gestao.css` (estrutura) e `frontend/src/components/Polaris.css` (refinamentos e novos padrões — é o arquivo a estender). Estilos específicos de uma área ficam ao lado da página (`pages/*.css`).

- Fundo cinza neutro (`--bg`), superfície branca (`--surface`); o sistema tem um único tema, o claro.
- Ação principal grafite (`#303030`); azul (`#005bd3`, a cor do ícone do sistema) na identidade (ícone, barra de carregamento, avatar) e em links de texto; verde só em estados positivos. O ícone do sistema é um cubo em três tons de azul com cantos arredondados: `frontend/public/favicon.svg` (favicon e `apple-touch-icon.png`) e o componente `LogoSistema`, que usa azuis mais claros porque o cabeçalho e o login são escuros.
- Raios de 8–12 px; sombras excepcionais; bordas finas.
- Os campos mantêm a fonte de 12–14 px; para o iOS não dar zoom na tela ao focá-los, o viewport recebe `maximum-scale=1` **só enquanto um campo está em foco** (`utils/zoomCampos.ts`). Fora disso o zoom por pinça fica liberado (acessibilidade). Se o zoom voltar em algum aparelho, a alternativa é fonte de 16 px nos campos em telas de toque.
- Tipografia: pilha nativa do sistema, sem fonte externa. Texto de tabela e campos em 12–13 px; rótulos de campo em 12 px cinza.
- Rótulos em *sentence case* ("Novo equipamento", "Unidade de origem"), sem dois-pontos e sem asterisco de obrigatório.

## Estrutura de uma página

1. Cabeçalho global em largura total (nome do sistema + usuário).
2. Menu lateral abaixo do cabeçalho, fundo cinza-claro, item ativo em superfície branca; vira painel sobreposto no mobile, sem botão de fechar: fecha ao tocar fora, ao escolher um item, pelo botão de menu do cabeçalho ou com `Escape`. Itens: Início, Inventário, Solicitações, Estoque, Atas, Contratos, Relatórios (cada perfil vê apenas o que pode usar). **Não há item "Manutenções"**: a manutenção é um tipo de solicitação e aparece em Solicitações (a terceirizada vê ali só as manutenções do seu contrato). **Conversas** e **Configurações** ficam isolados no rodapé do menu (Configurações só para o Administrador; os demais perfis veem apenas Conversas no rodapé).
3. Título curto (sem subtítulo redundante) e ações principais à direita.
4. Conteúdo em superfícies brancas com a mesma largura e os mesmos recuos do Início/Inventário (272 → 1408 px a 1440 px). Todas as telas devem manter essa margem.
5. Mudança de página usa uma transição suave de entrada (`pagina-transicao`) e uma **barra de carregamento fina no topo da janela** (`BarraCarregamento`) enquanto há requisições à API em andamento — troca de tela, login e ações. Ela só aparece após 120 ms (sem piscar em respostas instantâneas) e fica ao menos 450 ms. Enquanto os dados chegam, listas e detalhes mostram **esqueletos** (`Esqueletos.tsx`: linhas cinzas pulsando no desenho da tabela ou dos cards) em vez de uma tela vazia com a palavra "Carregando…"; ao chegar, as linhas entram em cascata curta e a página entra com fade e deslize de 0,4 s. O app entra com um fade ao fazer login ou recarregar, e **Sair** esmaece o app por 0,35 s antes de voltar ao login (que também entra com fade), e a verificação inicial da sessão mostra um spinner centralizado. Tudo respeita `prefers-reduced-motion`.

### Submenus

Relatórios abre submenus no menu lateral (Visão geral, Ampliação, Empréstimos, Cessões de uso, Manutenções); apenas o submenu selecionado fica marcado, o item pai não.

### Configurações

Configurações é uma página própria com navegação própria: ao abrir, o menu lateral é **substituído** por Usuários, Unidades, Categorias de itens, Tipos de itens e Atendimento, e um **X** no canto superior direito da página (acima das ações) fecha e volta ao Início. Só o Administrador acessa. Não há modal de configurações.

## Cores de status

Uma única regra para todas as telas, definida em `frontend/src/components/StatusPill.tsx` (mapa `CORES`, função `corDoStatus`). Todo status aparece como `StatusPill` (texto com ponto colorido); um valor sem cor definida cai em cinza. Um status novo deve ser acrescentado ao mapa, e o teste `StatusPill.test.tsx` protege a regra.

| Cor | Regra | Exemplos |
|---|---|---|
| Verde | Terminou bem ou está disponível | Concluída, Ativo, Ata ativa, Estoque coberto, conservação Ótimo ou Bom |
| Azul | Em andamento, sem ninguém travando | Em Andamento, Aguardando Orçamento (espera a empresa), Reservado, Emprestado |
| Amarelo | Precisa de uma ação ou merece atenção | Pendente Aprovação, Orçamento Registrado (aguarda validação), Aguardando Saída/Recebimento/Retorno/Entrega, Em Manutenção, Regular, Vencendo, Estoque baixo |
| Vermelho | Recusado ou com problema | Negada, Ata vencida, Contrato expirado, Estoque zero, Atrasado, Saldo baixo, conservação Ruim ou Péssimo |
| Cinza | Encerrado ou inativo, sem juízo de valor | Baixado, Cedido, Expirada (SLA), Inativo |

Roxo não é cor de status; fica só para etiquetas de classificação (`badge-purple`, ex.: "Emenda"). Os indicadores dos relatórios usam grafite e cinza de propósito (gráficos sóbrios) e não seguem esta tabela.

## Listas (resource index)

Padrão do Inventário, reutilizado por Solicitações (que também lista as manutenções, como o tipo **Manutenção**, ordenadas da mais recente para a mais antiga, com o número `MAN-0007` e o link para o detalhe da manutenção), Estoque, Atas, Contratos e pelas listas de Configurações (componente `ListaCadastro` para cadastros simples):

- uma única superfície contendo **seletor de visualização** (largura fixa, ex.: "Todos", "Ativos"), **busca** (`Buscar e filtrar`) e, quando houver, ícone de filtros/ordenação em popover;
- tabela com cabeçalho cinza; **primeira coluna em destaque** (abre o detalhe/edição, sem coluna de ações para uma única ação), demais colunas em texto padrão `#303030` 12 px, linhas de apoio em cinza;
- Nos detalhes de solicitação e de manutenção, o cartão **Informações** tem uma linha do item (**Item**, igual na solicitação e na manutenção): o nome em cima e, embaixo em cinza pequeno, o tombamento; numa ampliação, que ainda não tem tombamento, o código do tipo do item;
- Solicitações e manutenções têm um **título obrigatório** (campo "Título", até 80 caracteres, preenchido na abertura; o envio fica bloqueado sem ele): a primeira coluna mostra **só o número** (`SOL-0012`, `MAN-0007`) **e, embaixo, o título**, sem repetir o nome do item. Os pedidos antigos receberam um título gerado ("Ampliação · Autoclave Vertical 75L", cortado em 80 caracteres); os criados pelo próprio sistema (como a substituição gerada por uma baixa) não têm título e mostram o nome do item no lugar dele. O título também é o cabeçalho do detalhe, aparece na lista de conversas, nos relatórios de Empréstimos e Cessões e na busca; o menu lateral de conversas segue só com a referência.
- Solicitações e manutenções exibem o **número da requisição** (`SOL-0012`, `MAN-0007`, fonte monoespaçada cinza) acima do nome na primeira coluna, e junto ao título nos detalhes e na tela de conversa; a busca aceita o número ("12", "SOL-0012"). O `#` é reservado ao tombamento;
- o Inventário tem a mesma primeira coluna do Estoque: **Equipamento**, com o tombamento em cinza pequeno logo abaixo do nome (sem coluna própria de tombamento); as demais colunas são Unidade, Status, Conservação e Aquisição;
- Inventário e Estoque mostram a **miniatura do tipo de item** (`MiniaturaItem`, 36 px) à esquerda do nome: a foto do catálogo ou, sem foto ou se ela não carregar, um quadrado cinza liso (sem ícone), para as linhas ficarem alinhadas. A miniatura é decorativa (`aria-hidden`), pois o nome está ao lado, e **não aparece nos cartões do mobile**;
- estado em *pill* suave com ponto colorido, sempre pelo componente `StatusPill` (cores em "Cores de status", abaixo);
- rodapé com "N itens · Mostrando a–b" e paginação "Anterior / Página x de y / Próxima" (10 por página);
- quatro estados visíveis: carregando, vazio, erro (com "Tentar novamente") e sucesso; nenhum erro de rede pode parecer lista vazia válida;
- **no mobile (até 600 px) a tabela vira lista de cartões**, sem rolagem horizontal: cada linha é um bloco com o nome em destaque e o status à direita, os dados de apoio abaixo e o cartão inteiro como alvo de toque. O HTML continua sendo `<table>` (o cabeçalho fica oculto só visualmente). Ative com a classe `lista-cartoes` + uma variante (`--inventario`, `--atas`, `--estoque`, `--manutencoes`, `--fluxo`; Contratos usa a mesma variante `--atas`) no contêiner, `cartao-*` nas células e `data-label` onde o valor precisa de rótulo (Valor total, Saldo, Vencimento…). A disposição de cada tela fica em `Polaris.css`; as listas de Configurações usam a variante `--fluxo` (nome em destaque e demais campos em duas colunas; `larga: true` na coluna para ocupar a linha toda). Entre 601 e 900 px a tabela segue com colunas escondidas por largura;
- o rótulo do seletor de visualização (ex.: "Aguardando orçamento") termina em reticências quando não cabe no botão, sem empurrar a seta nem passar do elemento; o menu cresce até 320 px conforme o texto e corta com reticências além disso;
- a busca (`Buscar e filtrar`) nunca impõe largura mínima: em telas estreitas ela encolhe e o texto é cortado dentro do campo, sem passar por cima do botão de filtros.

Filtros usam rótulos curtos ("Todos", "Coberto", "Baixo", "Zero"); não repetir o nome do relatório/lista em subtítulos.

## Cadastros e edição (páginas, não modais)

Cadastros e edições abrem em **página própria** (`/recurso/novo`, `/recurso/:id`), nunca em modal:

- título à esquerda; **Cancelar** e **Salvar** no topo à direita (nas telas de nova solicitação e nova manutenção o primário se chama **Enviar**; Salvar é o primário e fica desabilitado enquanto não há alteração — `semAlteracoes`); ações destrutivas ("Excluir") ficam antes de Cancelar, exigem confirmação (`window.confirm`) e dão retorno depois;
- campos em grade de duas colunas, cada um com rótulo cinza pequeno e divisor tracejado/fino entre linhas; placeholders só quando agregam ("Ex.: 045/2026"); sem "(opcional)" nos rótulos;
- identificadores imutáveis (tombamento, número da ata, e-mail, matrícula) ficam desabilitados na edição;
- ao salvar, volta à lista com mensagem de sucesso temporária ("Ata cadastrada.");
- componente base: `PaginaCadastro`; páginas de recurso carregam a lista e localizam o item quando não há endpoint por id.

Hoje o sistema não tem modais: confirmações usam `window.confirm` e erros usam `window.alert`. Se um modal voltar a ser necessário, ele deve ter `aria-modal`, foco inicial, contenção de foco, fechamento por `Escape` e devolução do foco.

## Formulários e seleção

- Seleção de tipo/entidade usa o seletor padrão do projeto (`SelectItem`, aparência de *select* com busca), com o texto "Selecione…"; o tipo de solicitação/movimentação usa o mesmo seletor e o formulário correspondente aparece **na mesma tela** logo após escolher.
- Escolha única entre poucas opções excludentes usa **bolinhas (radio)**, com o campo dependente aparecendo somente após a seleção (ex.: "Recebido corretamente" / "Com divergência" → confirmar número / "Qual a divergência").
- Listas de itens adicionados usam **linhas compactas** com remoção discreta; empréstimo e demais blocos mantêm a mesma largura entre linhas.
- Anexo (`CampoAnexo`) e checkbox seguem o mesmo visual dos demais campos; remover é uma ação textual minimalista.
- Campos que surgem após uma ação (prioridade ao aprovar, motivo ao negar) aparecem sem "piscar": o espaço é reservado/animado e a ação primária continua à direita. Confirmações redundantes são evitadas (aprovar empréstimo não pede segunda confirmação).
- Resumos de orçamento ou valores não são repetidos ao lado dos botões de decisão.

## Item não encontrado

Nos formulários de manutenção e de solicitação (tipos que escolhem um equipamento existente), abaixo da seleção aparece "Não encontrou o item? **Fale com o atendimento**": link para o WhatsApp do atendimento (`wa.me`) com a mensagem pré-escrita (unidade e solicitante). O número é editado pelo Administrador em Configurações › **Atendimento**; sem número, o link não aparece. A abertura de manutenção pede **apenas a descrição do problema** (não há campo de justificativa).

## Detalhes de um recurso

Página própria com conteúdo principal e resumo lateral, em cards de altura compacta e mesma altura nas linhas lado a lado:

- título + *badge* de status no mesmo estilo do Inventário (compacto);
- seções com título e divisor; textos de resposta (ex.: "Motivo da negação") seguem a hierarquia normal, **não** em vermelho;
- o botão claro **Conversar** fica no canto superior direito do cabeçalho de solicitações e manutenções (no mobile, em linha própria abaixo do título, sempre à esquerda) e leva à tela de conversa (não há chat embutido nos detalhes);
- ações disponíveis ficam **direto na tela**, abaixo dos cards (não dentro de um bloco "Ações"), alinhadas à direita; o botão primário é o mais à direita; em solicitações, as ações ficam sob "Localização"; na manutenção o **Item do contrato** mostra só o nome do tipo de serviço;
- **Histórico** é um card recolhido por padrão, com seta para expandir/recolher (`HistoricoRecolhivel`); fica antes dos botões de ação; no Inventário fica à esquerda;
- no detalhe do equipamento, um **ícone de QR Code** ao lado do tombamento (sob o título) imprime a etiqueta ao clicar: o QR é gerado no navegador, e a etiqueta mostra QR, tombamento, descrição e unidade, com o resto da página oculto na impressão. Não há card de QR na página;
- no detalhe do equipamento, a **unidade dona** (item ativo) tem à direita do cabeçalho os botões claros **Abrir solicitação** e **Abrir manutenção**; eles levam ao formulário correspondente com `?equipamento=<id>`, e o item já vem escolhido (em solicitação, nos tipos Substituição, Recolha e Empréstimo);
- anexos e laudos são protegidos: abrem por `LinkArquivoProtegido`/`ImagemProtegida` (token enviado no download).

### Conversas (tela dedicada)

**Conversas** fica no rodapé do menu lateral, acima de Configurações quando o perfil a tem. Ao abrir, o menu lateral é substituído pela lista de conversas (sem título de grupo), da mais recente para a mais antiga, mostrando só a referência do pedido (`SOL-0012`, `MAN-0007`; o tipo e o item aparecem como dica ao passar o mouse) e a selecionada em superfície branca. A lista se atualiza sozinha: ao enviar uma mensagem (mesmo a primeira de uma conversa nova) e a cada 30 s. Sem conversa aberta, no computador o corpo da página mostra só o convite **"Selecione uma conversa para ler"** (a lista fica exclusivamente no menu lateral; carregando, vazio e erro com nova tentativa continuam aparecendo); no celular, onde o menu lateral fica fechado, a lista continua no corpo da página como ponto de partida.

**Mensagens não lidas.** Cada pessoa tem a própria leitura. Indicadores, todos com o mesmo contador azul (`ContagemNaoLidas`, "99+" acima de 99): o item **Conversas** do menu, cada conversa não lida no menu lateral (referência em negrito), a lista de conversas do corpo da página, o número entre parênteses no título da aba ("(3) Gestão Patrimonial") e o cartão **Mensagens não lidas** do Início (até 5 conversas, com autor e trecho da última mensagem; estados de carregando, vazio e erro com nova tentativa). A conversa é marcada como lida ao ser aberta com a aba visível e com a pessoa no fim da lista; se chegar mensagem com a pessoa lendo acima, só conta como lida quando ela rolar até o fim. Os Gestores só veem (e só contam) as conversas em que estão envolvidos, mais a fila dos pedidos pendentes sem decisão; a atualização é por consulta periódica (30 s), sem conexão persistente.

A página segue o padrão das demais: título à esquerda — o **número do pedido** (`SOL-0012`, `MAN-0007`), sem descrição abaixo; uma conversa ainda sem mensagens busca o número no próprio registro — e a ação secundária "Ver solicitação"/"Ver manutenção" (botão claro) à direita, e o **painel inteiro à direita do menu fica branco**: o chat não é um card separado. As mensagens rolam na largura do conteúdo (as suas à direita, em balão cinza-claro) e o campo de envio arredondado fica fixo na base. Cada mensagem mostra só **nome e data/hora** (sem cargo); as suas ficam à direita em balão cinza. O campo de envio segue o Sidekick: cápsula branca com sombra leve, texto que cresce com o conteúdo e um botão circular escuro com seta para cima (só ícone, `aria-label` "Enviar mensagem"; também `Ctrl/Cmd + Enter`). A página não rola: o chat ocupa a altura disponível e só a lista de mensagens rola. Um **X** no canto superior direito fecha e volta ao Início (mesmo padrão de Configurações). No mobile, `/conversas` mostra a lista no corpo da página e a conversa abre em tela cheia.

## Início

Caixa de entrada operacional, não painel analítico: saudação, alertas importantes e mensagens não lidas, empilhados, com altura definida pelo conteúdo e sem ícones decorativos. Indicadores e gráficos pertencem às telas especializadas; integrações indisponíveis (mensagens) aparecem como estado vazio explícito.

## Relatórios

Quatro relatórios, um por submenu, só com o nome do relatório no título (sem frase explicativa):

- filtros em um card no topo com `<select>` nativos (Período com opção "Personalizado", Unidade de origem, Item);
- **cards de KPI pequenos** (rótulo + valor, barra fina de proporção quando fizer sentido); sem "no período", sem clique para detalhar;
- gráficos sóbrios e modernos: barras horizontais finas em tons de cinza/grafite, legenda simples, sem eixos pesados;
- tabelas no padrão de lista, sem contador "N registros" e sem colunas redundantes (Empréstimos e Cessões abrem com a coluna "Solicitação": o número em cinza e, embaixo, o título; o tombamento (Empréstimos) e o equipamento com o patrimônio (Cessões) seguem em colunas próprias; sem "Duração média"); cabeçalhos ordenáveis com ícone alinhado ao texto. No mobile as tabelas dos relatórios viram cartões (mesmo padrão das listas) e, em Itens e estoque, a ordenação passa a um seletor "Ordenar por" no card de filtros, já que o cabeçalho some;
- unidades de medida só onde ajudam (quantidades sem "un.").

## Estoque

Lista por galpão com "Equipamento" (código abaixo do nome), Categoria, Disponível, Reservado e Status. Uma ação única **Movimentar** abre uma página em que se escolhe Entrada ou Saída com o seletor padrão, sem traço sob "Tipo de movimentação". Termos: "equipamento" (não "produto").

## Autenticação

Tela de acesso com o ícone do sistema e o nome no topo (no mobile, centralizados e com o ícone maior), formulário central em um card e a mensagem de suporte no próprio card; no mobile o card fica centralizado na vertical; fundo em gradiente discreto. Não há "Esqueceu a senha?": a redefinição é feita pelo Administrador (Configurações › Usuários › Nova senha) e a mensagem de suporte no card orienta quem tiver dificuldade. Impersonação é restrita ao Administrador: no menu do usuário (canto superior direito), o item **"Entrar como"**, acima de "Sair", começa recolhido e, ao clicar, expande a lista de usuários ativos com busca; um clique entra como a pessoa (também a partir de um usuário já assumido). A própria conta é a primeira da lista ("Conta atual", desabilitada; depois de assumir outro usuário vira "Voltar à sua conta"); não há botão de redefinir. A ação é auditada. Ao entrar como outro usuário, **a página é recarregada na tela inicial**, para nenhum estado do usuário anterior (listas, contadores, rascunhos) sobrar na tela.

## Conteúdo e linguagem

- **Sem toasts de sucesso.** Salvar, cadastrar ou excluir volta para a lista, e ações nos detalhes mudam o status na própria tela; a mudança visível é a confirmação. Erros de ação — login, envio de formulários, ações nos detalhes, envio de mensagem (por exemplo "Saldo insuficiente na ata", "Muitas tentativas de login") — e o resultado de importações de CSV aparecem no **alerta nativo do navegador** (`window.alert`, via `useAlertaNativo`), que exige reconhecimento e dispensa componente próprio. Falhas de carregamento de lista ou página continuam em faixa inline com "Tentar novamente".
- Verbos claros e curtos em botões: "Novo equipamento", "Salvar", "Tentar novamente".
- Frases de estado completas e neutras ("Nenhuma ata encontrada").
- Estados sempre em badge com texto (não depender só de cor).
- Nomes: "Categorias de itens" e "Tipos de itens" (menu e telas de Configurações).

## Responsividade e validação

Verificar em 1440 px, 900 px e 390 px. Em mudanças visuais, registrar capturas de Início e da tela alterada. Gate mínimo: lint, testes e build do frontend. Para validar localmente com dados reais use o Docker Compose (a porta do `web` é definida por `WEB_PORT`).

## Convenções de código ligadas à UX

- Listas de cadastro: `components/ListaCadastro.tsx`; páginas de cadastro: `components/PaginaCadastro.tsx`; restrição por perfil: `components/RotaRestrita.tsx`; carga com estado: `hooks/useCarga.ts`.
- Mensagens temporárias: `hooks/useMensagemTemporaria.ts`; navegação com retorno: `navigate(destino, { state: { mensagem } })`.
- Relatórios em `pages/relatorios/` (um arquivo por relatório; filtros compartilhados em `filtros.tsx`).
- Falhas de carregamento nunca são descartadas em silêncio (`.catch(() => {})` é proibido).
- Não reintroduzir CSS sem uso: ao remover uma tela, remova as classes exclusivas dela.

## Próximas evoluções

- paginação e filtros no backend (hoje as listas paginam no cliente);
- divisão de bundle por rota;
- validar a direção com usuários dos quatro perfis antes de consolidar novos componentes.
