# Requisitos Funcionais

Extraído da seção 2.3–2.5 do [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf). Veja também [Casos de Uso](Casos-de-Uso) para os fluxos operacionais correspondentes.

## Autenticação e Controle de Acesso

| ID | Requisito |
|---|---|
| RF01 | O sistema deve permitir que o usuário realize login com e-mail e senha. |
| RF02 | O sistema deve permitir que o administrador (Gestor de Patrimônio) cadastre usuários, atribua perfis e redefina senhas, em Configurações. Não há tela de "esqueci a senha" nem envio automático por e-mail: a redefinição é sempre feita por ele. |
| RF03 | O sistema deve restringir o acesso a funcionalidades de acordo com o perfil do usuário autenticado. |
| RF04 | O sistema deve manter sessão autenticada com expiração automática (duração configurável, 30 minutos por padrão); ao expirar, o usuário entra novamente. |

## Gestão de Patrimônio

| ID | Requisito |
|---|---|
| RF05 | O sistema deve permitir que o Galpão importe equipamentos via arquivo CSV no formato exportado pelo e-Pública. |
| RF06 | O sistema deve permitir que o Galpão cadastre um equipamento manualmente, informando: número de tombamento, descrição, unidade de localização, estado de conservação e flag de emenda parlamentar. |
| RF07 | O sistema deve garantir que o número de tombamento seja único e imutável após o cadastro. |
| RF08 | O sistema deve permitir que a Unidade consulte o inventário dos equipamentos sob sua responsabilidade. |
| RF09 | O sistema deve permitir que o Gestor de Patrimônio consulte o inventário completo da rede, com filtros por unidade, tipo de equipamento, estado de conservação e status. |
| RF10 | O sistema deve registrar e exibir o histórico completo de movimentações e eventos de cada equipamento. |

## Manutenção

| ID | Requisito |
|---|---|
| RF11 | O sistema deve permitir que a Unidade abra uma solicitação de manutenção para um equipamento, informando apenas a descrição do problema (sem justificativa). |
| RF12 | O sistema deve permitir que o Gestor de Manutenção aprove ou negue uma solicitação de manutenção, com registro de justificativa. |
| RF13 | O sistema deve alterar o status do equipamento para "em manutenção" após aprovação da solicitação. |
| RF14 | O sistema deve permitir que o Gestor de Manutenção registre o orçamento retornado pela empresa terceirizada. |
| RF15 | O sistema deve permitir que o Gestor de Manutenção aprove ou rejeite o orçamento registrado. |
| RF16 | O sistema deve permitir que o Gestor de Manutenção emita um laudo de baixa quando o equipamento for declarado irrecuperável. |
| RF17 | O sistema deve abrir automaticamente uma solicitação de novo item ao Gestor de Patrimônio quando um laudo de baixa for emitido. |
| RF18 | O sistema deve permitir que a Unidade e o Gestor de Manutenção confirmem o retorno do equipamento após a manutenção, registrando o estado pós-serviço. |
| RF19 | O sistema deve registrar o custo e a data de cada manutenção no histórico do equipamento. |

## Cessão de Uso

| ID | Requisito |
|---|---|
| RF20 | O sistema deve permitir que a Unidade solicite a cessão de uso de um equipamento para outra unidade, informando justificativa e unidade de destino. |
| RF21 | O sistema deve permitir que o Gestor de Patrimônio aprove ou negue uma solicitação de cessão de uso. |
| RF22 | O sistema deve permitir que a unidade de origem confirme a saída do equipamento. |
| RF23 | O sistema deve permitir que a unidade de destino confirme o recebimento e atualize automaticamente a localização do tombamento. |

## Empréstimo

| ID | Requisito |
|---|---|
| RF24 | O sistema deve permitir que a Unidade A registre um empréstimo de equipamento para a Unidade B, informando a data prevista de retorno. |
| RF25 | O sistema deve manter o tombamento do equipamento vinculado à Unidade A durante o período de empréstimo, sinalizando a localização temporária. |
| RF26 | O sistema deve permitir que a Unidade B registre a avaliação do estado do equipamento no recebimento. |
| RF27 | O sistema deve permitir que a Unidade A confirme o retorno do equipamento, encerrando o empréstimo e atualizando o histórico. |

## Solicitação de Novos Itens

| ID | Requisito |
|---|---|
| RF28 | O sistema deve permitir que a Unidade solicite a aquisição de um novo equipamento, informando tipo, quantidade, justificativa e origem do recurso (regular ou emenda parlamentar). |
| RF29 | O sistema deve permitir que o Gestor de Patrimônio aprove ou negue a solicitação, vinculando a aprovação a uma ata de registro de preços. |
| RF30 | O sistema deve permitir que o Galpão registre a entrada física do novo equipamento e realize o cadastro com tombamento. |
| RF36 | O sistema deve distinguir dois tipos de estoque no Galpão: estoque interno (equipamentos sob guarda física do galpão) e estoque Branet (registro oficial de saída). O Galpão deve poder visualizar e atualizar cada estoque separadamente. |
| RF37 | O sistema deve permitir que o Galpão confirme o despacho físico de um equipamento para uma unidade de destino, atualizando o estoque interno. |

## Controle de Atas

| ID | Requisito |
|---|---|
| RF31 | O sistema deve permitir que o Gestor de Patrimônio cadastre atas de registro de preços, informando valor total, saldo disponível e data de vencimento. |
| RF32 | O sistema deve atualizar automaticamente o saldo da ata quando o pedido da solicitação vinculada é lançado no Branet. Ao vincular, o saldo disponível já desconta os valores comprometidos em outras solicitações reservadas, e o saldo nunca fica negativo. |
| RF33 | O sistema deve alertar o Gestor de Patrimônio quando uma ata estiver com vencimento em até 30 dias ou com saldo inferior a 10% do valor total. |

## Conversa

| ID | Requisito |
|---|---|
| RF38 | O sistema deve permitir que os participantes de uma solicitação ou de uma manutenção conversem dentro dela por mensagens de texto (até 2.000 caracteres), em ordem cronológica, sem edição ou exclusão. Participam os perfis que já enxergam o registro (solicitação: Gestor de Patrimônio, Unidade e Galpão; manutenção: Gestor de Patrimônio, Gestor de Manutenção e Unidade), e a Unidade só vê conversas da própria unidade. |
| RF39 | Quando uma mensagem é enviada por quem não é da unidade, o sistema deve avisar a unidade por e-mail, sem incluir o conteúdo da mensagem. |
| RF40 | O sistema deve oferecer o menu Conversas, com a lista das conversas que o usuário pode ver (ordenadas pela mensagem mais recente) e uma tela dedicada para cada conversa. |
| RF41 | O sistema deve atribuir a cada solicitação e a cada manutenção um número sequencial legível e imutável (formato SOL-0001 e MAN-0001), exibi-lo nas listas, nos detalhes e nas conversas e permitir buscar por ele. |
| RF42 | O sistema deve gerar para cada equipamento um QR Code que leva direto à sua tela de detalhes (impresso como etiqueta, por um ícone ao lado do tombamento, com tombamento, descrição e unidade). O QR contém apenas o endereço; quem o lê precisa estar autenticado e ter permissão para ver o equipamento. |
| RF43 | O detalhe do equipamento deve oferecer à unidade dona, enquanto o item está ativo, os botões "Abrir manutenção" e "Abrir solicitação", que levam aos respectivos formulários com o equipamento já escolhido. |
| RF44 | Ao abrir manutenção ou solicitação, quem não encontrar o equipamento na lista deve ter um link "Fale com o atendimento" que abre o WhatsApp do atendimento com a mensagem pré-escrita; o número é configurado pelo Gestor de Patrimônio em Configurações › Atendimento e o link some se não houver número. |

## Relatórios

| ID | Requisito |
|---|---|
| RF34 | O sistema deve exibir para o Gestor de Patrimônio, em Relatórios, quatro relatórios: visão geral (funil de solicitações por tipo e ranking de unidades por volume), empréstimos (prazos e devoluções), cessões de uso (prestação de contas) e itens e estoque (itens aguardando disponibilidade). |
| RF35 | O sistema deve permitir que o usuário filtre os relatórios por período, unidade e item (tipo de equipamento). |

## Requisitos Não Funcionais (RNF)

### Desempenho

| ID | Requisito |
|---|---|
| RNF01 | O sistema deve responder a consultas e ações do usuário em no máximo 2 segundos em condições normais de uso. |
| RNF02 | O sistema deve suportar pelo menos 100 usuários simultâneos sem degradação de desempenho. |
| RNF03 | A importação de arquivos CSV com até 10.000 linhas deve ser concluída em no máximo 30 segundos. |

### Segurança

| ID | Requisito |
|---|---|
| RNF04 | O sistema deve utilizar autenticação segura com senha criptografada (bcrypt ou equivalente). |
| RNF05 | O sistema deve implementar controle de acesso baseado em perfis (RBAC), garantindo que cada usuário acesse apenas as funcionalidades permitidas ao seu perfil. |
| RNF06 | O sistema deve registrar logs de auditoria para todas as ações críticas: aprovações, negações, baixas, cessões e alterações de tombamento. |
| RNF07 | O sistema deve utilizar comunicação HTTPS em todas as requisições. |

### Disponibilidade

| ID | Requisito |
|---|---|
| RNF08 | O sistema deve ter disponibilidade mínima de 99% em dias úteis no horário de funcionamento da secretaria (07h–19h). |

### Usabilidade

| ID | Requisito |
|---|---|
| RNF09 | O sistema deve ser responsivo e funcionar adequadamente nos navegadores Google Chrome e Microsoft Edge em versões atualizadas. |
| RNF10 | As ações mais frequentes de cada perfil devem ser acessíveis em no máximo 3 cliques a partir da tela inicial. |
| RNF11 | O sistema deve exibir mensagens de erro claras e orientadas ao usuário, sem expor detalhes técnicos internos. |

### Escalabilidade

| ID | Requisito |
|---|---|
| RNF12 | A arquitetura do sistema deve permitir a adição de novas unidades de atendimento sem necessidade de alterações estruturais no banco de dados ou na aplicação. |

## Regras de Negócio (RN)

| ID | Regra |
|---|---|
| RN01 | O número de tombamento é único por equipamento e não pode ser alterado após o cadastro. |
| RN02 | Um equipamento com status "em manutenção" não pode ser cedido, emprestado ou baixado até o encerramento do ciclo de manutenção. |
| RN03 | Somente o Gestor de Manutenção pode aprovar solicitações de manutenção, validar orçamentos e emitir laudos de baixa. |
| RN04 | Somente o Gestor de Patrimônio pode aprovar solicitações de cessão de uso e de novos itens. |
| RN05 | O empréstimo entre unidades não requer aprovação do Gestor de Patrimônio, mas deve ser registrado no sistema pela unidade cedente. |
| RN06 | Durante um empréstimo, o tombamento do equipamento permanece vinculado à unidade de origem. A unidade receptora aparece apenas como detentora temporária. |
| RN07 | A emissão de um laudo de baixa por impossibilidade de manutenção deve gerar automaticamente uma solicitação de novo item no nome da unidade de origem do equipamento. |
| RN08 | Uma ata de registro de preços vencida não pode ser vinculada a novas solicitações de aquisição. |
| RN09 | O saldo de uma ata não pode ficar negativo. O sistema deve impedir aprovações que ultrapassem o saldo disponível. |
| RN10 | Itens adquiridos por emenda parlamentar devem ser sinalizados com flag específica no cadastro, visível em todos os relatórios e históricos. |
| RN11 | A confirmação de retorno de manutenção exige validação de dois atores: a Unidade (como usuária do equipamento) e o Gestor de Manutenção (como fiscal do contrato). |

## Fora do Escopo

Itens explicitamente excluídos do escopo deste projeto (seção 2.6 do RFC):

- Integração técnica (via API) com GLPI, SEI, e-Pública ou Branet — entrada de dados desses sistemas é manual ou via CSV.
- Gestão de insumos e materiais de consumo (medicamentos, insumos hospitalares).
- Gestão financeira e contábil (depreciação, balanço patrimonial, normas do MCASP).
- Acesso de empresas terceirizadas ao sistema — mediado sempre pelo Gestor de Manutenção.
- Módulo de licitação e compras — o sistema só registra atas já existentes.
- Aplicativo mobile nativo — apenas web responsiva.
- Gestão de empenhos orçamentários.
- Controle de frota de veículos.
