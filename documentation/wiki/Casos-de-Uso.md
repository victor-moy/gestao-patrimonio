# Casos de Uso

Extraído da seção 2.2 do [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf). Veja também [Requisitos Funcionais](Requisitos-Funcionais) para o detalhamento de cada regra.

## Personas

| Persona | Perfil no sistema | Resumo |
|---|---|---|
| Gestor de Patrimônio | `GESTOR_PATRIMONIO` | Visão geral do inventário; aprova cessões de uso e novos itens; vincula aprovações a atas; acessa todos os relatórios. |
| Gestor de Manutenção | `GESTOR_MANUTENCAO` | Fiscal do contrato com terceirizadas; aprova manutenções, valida orçamentos, emite laudos de baixa. |
| Unidade de Atendimento | `UNIDADE` | Servidores das UBS, UME, CAC e demais unidades; abrem solicitações de manutenção, cessão, empréstimo e novos itens. |
| Galpão (Felipe) | `GALPAO` | Entrada e saída física de equipamentos no armazenamento central; confirma recebimentos e despachos. |
| Sistema (automático) | — | Perfil não humano — ex.: abre automaticamente uma solicitação de novo item após um laudo de baixa (RN07). |

## Módulo de Patrimônio

- **UC01 — Importar patrimônio via CSV**: o Galpão importa um arquivo CSV exportado do e-Pública para popular o sistema com o inventário inicial.
- **UC02 — Cadastrar o item manualmente**: o Galpão cadastra um novo equipamento com número de tombamento, unidade de destino, estado de conservação e flag de emenda parlamentar.
- **UC03 — Consultar inventário da unidade**: a Unidade consulta a lista de equipamentos registrados sob sua responsabilidade.
- **UC04 — Consultar inventário geral**: o Gestor de Patrimônio consulta o inventário completo da rede com filtros por unidade, tipo de equipamento e estado.

## Módulo de Manutenção

- **UC05 — Solicitar manutenção**: a Unidade abre uma solicitação de manutenção para um equipamento específico, informando apenas a descrição do problema. Pode partir do botão "Abrir manutenção" no detalhe do equipamento (item já escolhido) ou escolher o item na lista; se não o encontrar, usa o link para o atendimento por WhatsApp.
- **UC06 — Aprovar ou negar manutenção**: o Gestor de Manutenção analisa a solicitação e aprova ou nega, registrando o motivo.
- **UC07 — Registrar orçamento da terceirizada**: o Gestor de Manutenção registra o orçamento retornado pela empresa terceirizada.
- **UC08 — Validar orçamento**: o Gestor de Manutenção aprova ou rejeita o orçamento. Se rejeitado, emite laudo de baixa e o sistema abre automaticamente uma solicitação de novo item.
- **UC09 — Confirmar retorno do equipamento**: a Unidade e o Gestor de Manutenção confirmam o retorno do equipamento, registrando o estado pós-manutenção.

## Módulo de Cessão de Uso

- **UC10 — Solicitar cessão de uso**: a Unidade solicita a transferência de um equipamento para outra unidade, com justificativa.
- **UC11 — Aprovar ou negar cessão**: o Gestor de Patrimônio aprova ou nega a solicitação.
- **UC12 — Confirmar saída e recebimento**: a unidade de origem confirma a saída e a unidade de destino confirma o recebimento, atualizando o tombamento.

## Módulo de Empréstimo

- **UC13 — Registrar empréstimo**: a Unidade A registra um empréstimo para a Unidade B, com data prevista de retorno.
- **UC14 — Avaliar o estado do equipamento**: a Unidade B registra o estado do equipamento no recebimento, assumindo responsabilidade.
- **UC15 — Confirmar retorno**: a Unidade A confirma o retorno do equipamento e encerra o empréstimo.

## Módulo de Novos Itens

- **UC16 — Solicitar novo item**: a Unidade solicita a aquisição de um novo equipamento, informando tipo, quantidade, justificativa e origem do recurso.
- **UC17 — Aprovar solicitação**: o Gestor de Patrimônio aprova e vincula a solicitação a uma ata de registro de preços disponível.
- **UC18 — Registrar entrada no galpão**: o Galpão registra a chegada do equipamento e realiza o cadastro com tombamento.

## Módulo de Atas

- **UC19 — Cadastrar ata de registro de preços**: o Gestor de Patrimônio cadastra uma ata com valor total, saldo disponível e data de vencimento.
- **UC20 — Consultar saldo de ata**: o Gestor consulta o saldo atualizado e o vencimento das atas ativas.

## Módulo de Conversa

- **UC26 — Conversar dentro de uma solicitação ou manutenção**: os participantes trocam mensagens de texto no próprio registro (por exemplo, o Gestor pede um esclarecimento e a Unidade responde). A conversa abre em uma tela dedicada, pelo botão **Conversar** do próprio registro ou pelo menu **Conversas** (com a lista de todas as conversas do usuário) e a unidade é avisada por e-mail quando o Gestor escreve.

## Módulo de Relatórios

- **UC21 — Consultar relatórios gerenciais**: o Gestor de Patrimônio consulta quatro relatórios — visão geral (funil de solicitações e unidades que mais solicitam), empréstimos, cessões de uso e itens aguardando estoque — filtrando por período, unidade e item.

## Módulo de Contratos

- **UC22 — Gerenciar contratos de manutenção**: o Gestor de Manutenção e o Gestor de Patrimônio cadastram e editam contratos com terceirizadas (fornecedor, tipo, vigência, valor e status); somente o Gestor de Patrimônio exclui.

## Módulo de Configurações

- **UC23 — Gerenciar usuários e unidades**: o Gestor de Patrimônio cadastra e edita usuários (perfil, unidade, situação e redefinição de senha) e unidades (tipo, endereço, e-mail e responsável).
- **UC24 — Gerenciar categorias e tipos de itens**: o Gestor de Patrimônio mantém as categorias e os tipos de itens (código, nome, preço de referência e imagem) usados no inventário e nas solicitações.
- **UC25 — Entrar como outro usuário**: o Gestor de Patrimônio assume temporariamente a visão de outro usuário para validar permissões; a ação é auditada, é feita por um ícone ao lado do nome do usuário na lista de Configurações › Usuários e pode ser desfeita em "Redefinir usuário", no menu do usuário acima de "Sair".
