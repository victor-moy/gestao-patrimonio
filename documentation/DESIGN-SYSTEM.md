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

- Fundo cinza neutro (`--bg`), superfície branca no tema claro e grafite no escuro (`--surface`).
- Ação principal grafite (`#303030`); azul só em links de texto; verde só na identidade e em estados positivos.
- Raios de 8–12 px; sombras excepcionais; bordas finas.
- Tipografia: pilha nativa do sistema, sem fonte externa. Texto de tabela e campos em 12–13 px; rótulos de campo em 12 px cinza.
- Rótulos em *sentence case* ("Novo equipamento", "Unidade de origem"), sem dois-pontos e sem asterisco de obrigatório.

## Estrutura de uma página

1. Cabeçalho global em largura total (nome do sistema + usuário).
2. Menu lateral abaixo do cabeçalho, fundo cinza-claro, item ativo em superfície branca; vira painel sobreposto no mobile. Itens: Início, Inventário, Manutenções, Solicitações, Estoque, Atas, Contratos, Relatórios (cada perfil vê apenas o que pode usar). **Conversas** e **Configurações** ficam isolados no rodapé do menu (Configurações só para o Gestor de Patrimônio; os demais perfis veem apenas Conversas no rodapé).
3. Título curto (sem subtítulo redundante) e ações principais à direita.
4. Conteúdo em superfícies brancas com a mesma largura e os mesmos recuos do Início/Inventário (272 → 1408 px a 1440 px). Todas as telas devem manter essa margem.
5. Mudança de página usa uma transição suave de entrada (`pagina-transicao`) e uma **barra de carregamento fina no topo da janela** (`BarraCarregamento`) enquanto há requisições à API em andamento — troca de tela, login e ações. Ela só aparece após 120 ms (sem piscar em respostas instantâneas) e fica ao menos 450 ms. Enquanto os dados chegam, listas e detalhes mostram **esqueletos** (`Esqueletos.tsx`: linhas cinzas pulsando no desenho da tabela ou dos cards) em vez de uma tela vazia com a palavra "Carregando…"; ao chegar, as linhas entram em cascata curta e a página entra com fade e deslize de 0,4 s. O app entra com um fade ao fazer login ou recarregar, e **Sair** esmaece o app por 0,35 s antes de voltar ao login (que também entra com fade), e a verificação inicial da sessão mostra um spinner centralizado. Tudo respeita `prefers-reduced-motion`.

### Submenus

Relatórios abre submenus no menu lateral (Visão geral, Empréstimos, Cessões de uso, Itens e estoque); apenas o submenu selecionado fica marcado, o item pai não.

### Configurações

Configurações é uma página própria com navegação própria: ao abrir, o menu lateral é **substituído** por Usuários, Unidades, Categorias de itens, Tipos de itens e Atendimento, e um **X** no canto superior direito da página (acima das ações) fecha e volta ao Início. Só o Gestor de Patrimônio acessa. Não há modal de configurações.

## Listas (resource index)

Padrão do Inventário, reutilizado por Solicitações, Manutenções, Estoque, Atas, Contratos e pelas listas de Configurações (componente `ListaCadastro` para cadastros simples):

- uma única superfície contendo **seletor de visualização** (largura fixa, ex.: "Todos", "Ativos"), **busca** (`Buscar e filtrar`) e, quando houver, ícone de filtros/ordenação em popover;
- tabela com cabeçalho cinza; **primeira coluna em destaque** (abre o detalhe/edição, sem coluna de ações para uma única ação), demais colunas em texto padrão `#303030` 12 px, linhas de apoio em cinza;
- Solicitações e manutenções exibem o **número da requisição** (`SOL-0012`, `MAN-0007`, fonte monoespaçada cinza) acima do nome na primeira coluna, e junto ao título nos detalhes e na tela de conversa; a busca aceita o número ("12", "SOL-0012"). O `#` é reservado ao tombamento;
- estado em *pill* suave com ponto colorido (`inventario-status`, tons verde/amarelo/vermelho/cinza/azul/roxo);
- rodapé com "N itens · Mostrando a–b" e paginação "Anterior / Página x de y / Próxima" (10 por página);
- quatro estados visíveis: carregando, vazio, erro (com "Tentar novamente") e sucesso; nenhum erro de rede pode parecer lista vazia válida;
- no mobile a tabela rola na horizontal, mantendo a primeira coluna.

Filtros usam rótulos curtos ("Todos", "Coberto", "Baixo", "Zero"); não repetir o nome do relatório/lista em subtítulos.

## Cadastros e edição (páginas, não modais)

Cadastros e edições abrem em **página própria** (`/recurso/novo`, `/recurso/:id`), nunca em modal:

- título à esquerda; **Cancelar** e **Salvar** no topo à direita (Salvar é o primário e fica desabilitado enquanto não há alteração — `semAlteracoes`); ações destrutivas ("Excluir") ficam antes de Cancelar, exigem confirmação (`window.confirm`) e dão retorno depois;
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

Nos formulários de manutenção e de solicitação (tipos que escolhem um equipamento existente), abaixo da seleção aparece "Não encontrou o item? **Fale com o atendimento**": link para o WhatsApp do atendimento (`wa.me`) com a mensagem pré-escrita (unidade e solicitante). O número é editado pelo Gestor de Patrimônio em Configurações › **Atendimento**; sem número, o link não aparece. A abertura de manutenção pede **apenas a descrição do problema** (não há campo de justificativa).

## Detalhes de um recurso

Página própria com conteúdo principal e resumo lateral, em cards de altura compacta e mesma altura nas linhas lado a lado:

- título + *badge* de status no mesmo estilo do Inventário (compacto);
- seções com título e divisor; textos de resposta (ex.: "Motivo da negação") seguem a hierarquia normal, **não** em vermelho;
- o botão claro **Conversar** fica no canto superior direito do cabeçalho de solicitações e manutenções e leva à tela de conversa (não há chat embutido nos detalhes);
- ações disponíveis ficam **direto na tela**, abaixo dos cards (não dentro de um bloco "Ações"), alinhadas à direita; o botão primário é o mais à direita; em solicitações, as ações ficam sob "Localização";
- **Histórico** é um card recolhido por padrão, com seta para expandir/recolher (`HistoricoRecolhivel`); fica antes dos botões de ação; no Inventário fica à esquerda;
- no detalhe do equipamento, um **ícone de QR Code** ao lado do tombamento (sob o título) imprime a etiqueta ao clicar: o QR é gerado no navegador, e a etiqueta mostra QR, tombamento, descrição e unidade, com o resto da página oculto na impressão. Não há card de QR na página;
- no detalhe do equipamento, a **unidade dona** (item ativo) tem à direita do cabeçalho os botões claros **Abrir solicitação** e **Abrir manutenção**; eles levam ao formulário correspondente com `?equipamento=<id>`, e o item já vem escolhido (em solicitação, nos tipos Substituição, Recolha e Empréstimo);
- anexos e laudos são protegidos: abrem por `LinkArquivoProtegido`/`ImagemProtegida` (token enviado no download).

### Conversas (tela dedicada)

**Conversas** fica no rodapé do menu lateral, acima de Configurações quando o perfil a tem. Ao abrir, o menu lateral é substituído pela lista de conversas (sem título de grupo), da mais recente para a mais antiga, com título curto ("Ampliação · Autoclave", "Manutenção · Microscópio") e a selecionada em superfície branca.

A página segue o padrão das demais: título à esquerda e a ação secundária "Ver solicitação"/"Ver manutenção" (botão claro) à direita, e o **painel inteiro à direita do menu fica branco**: o chat não é um card separado. As mensagens rolam na largura do conteúdo (as suas à direita, em balão cinza-claro) e o campo de envio arredondado fica fixo na base. Cada mensagem mostra só **nome e data/hora** (sem cargo); as suas ficam à direita em balão cinza. O campo de envio segue o Sidekick: cápsula branca com sombra leve, texto que cresce com o conteúdo e um botão circular escuro com seta para cima (só ícone, `aria-label` "Enviar mensagem"; também `Ctrl/Cmd + Enter`). A página não rola: o chat ocupa a altura disponível e só a lista de mensagens rola. Um **X** no canto superior direito fecha e volta ao Início (mesmo padrão de Configurações). No mobile, `/conversas` mostra a lista no corpo da página e a conversa abre em tela cheia.

## Início

Caixa de entrada operacional, não painel analítico: saudação, alertas importantes e mensagens não lidas, empilhados, com altura definida pelo conteúdo e sem ícones decorativos. Indicadores e gráficos pertencem às telas especializadas; integrações indisponíveis (mensagens) aparecem como estado vazio explícito.

## Relatórios

Quatro relatórios, um por submenu, só com o nome do relatório no título (sem frase explicativa):

- filtros em um card no topo com `<select>` nativos (Período com opção "Personalizado", Unidade de origem, Item);
- **cards de KPI pequenos** (rótulo + valor, barra fina de proporção quando fizer sentido); sem "no período", sem clique para detalhar;
- gráficos sóbrios e modernos: barras horizontais finas em tons de cinza/grafite, legenda simples, sem eixos pesados;
- tabelas no padrão de lista, sem contador "N registros" e sem colunas redundantes (Empréstimos: primeira coluna só o tombamento; sem "Duração média"); cabeçalhos ordenáveis com ícone alinhado ao texto;
- unidades de medida só onde ajudam (quantidades sem "un.").

## Estoque

Lista por galpão com "Equipamento" (código abaixo do nome), Categoria, Disponível, Reservado e Status. Uma ação única **Movimentar** abre uma página em que se escolhe Entrada ou Saída com o seletor padrão, sem traço sob "Tipo de movimentação". Termos: "equipamento" (não "produto").

## Autenticação

Tela de acesso com formulário central em um card e a mensagem de suporte no próprio card; fundo em gradiente discreto. Não há "Esqueceu a senha?": a redefinição é feita pelo Gestor de Patrimônio (Configurações › Usuários › Nova senha) e a mensagem de suporte no card orienta quem tiver dificuldade. Impersonação é restrita ao Gestor de Patrimônio: em Configurações › Usuários, um **ícone ao lado do nome** de cada usuário ativo (exceto o próprio) entra como aquele usuário com um clique; o botão "Redefinir usuário" aparece no menu do usuário (canto superior direito), logo **acima de "Sair"**, e só durante a impersonação; a ação é auditada.

## Conteúdo e linguagem

- **Sem toasts de sucesso.** Salvar, cadastrar ou excluir volta para a lista, e ações nos detalhes mudam o status na própria tela; a mudança visível é a confirmação. Erros de ação — login, envio de formulários, ações nos detalhes, envio de mensagem (por exemplo "Saldo insuficiente na ata", "Muitas tentativas de login") — e o resultado de importações de CSV aparecem no **alerta nativo do navegador** (`window.alert`, via `useAlertaNativo`), que exige reconhecimento e dispensa componente próprio. Falhas de carregamento de lista ou página continuam em faixa inline com "Tentar novamente".
- Verbos claros e curtos em botões: "Novo equipamento", "Salvar", "Tentar novamente".
- Frases de estado completas e neutras ("Nenhuma ata encontrada").
- Estados sempre em badge com texto (não depender só de cor).
- Nomes: "Categorias de itens" e "Tipos de itens" (menu e telas de Configurações).

## Responsividade e validação

Verificar em 1440 px, 900 px e 390 px, nos temas claro e escuro. Em mudanças visuais, registrar capturas de Início e da tela alterada. Gate mínimo: lint, testes e build do frontend. Para validar localmente com dados reais use o Docker Compose (`web` em `8081` no ambiente de desenvolvimento do Conductor).

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
