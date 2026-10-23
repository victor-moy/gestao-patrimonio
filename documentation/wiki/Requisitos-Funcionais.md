# Requisitos Funcionais

Extraído da seção 2.3–2.5 do [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf). Veja também [Casos de Uso](Casos-de-Uso) para os fluxos operacionais correspondentes.

## Autenticação e Controle de Acesso

| ID | Requisito |
|---|---|
| RF01 | O sistema deve permitir que o usuário realize login com a conta institucional da Prefeitura (Keycloak, OpenID Connect). O Keycloak só autentica; perfil e unidade são do SGP. Quem já está cadastrado é vinculado pelo e-mail no primeiro login; quem é novo entra como `SEM_ACESSO` (vê só a tela inicial, vazia) até um Administrador atribuir o perfil. |
| RF02 | O sistema deve permitir que o administrador (Administrador) cadastre usuários e atribua perfis, em Configurações. O SGP não guarda nem redefine senhas: a credencial é da conta institucional. |
| RF03 | O sistema deve restringir o acesso a funcionalidades de acordo com o perfil do usuário autenticado. |
| RF04 | O sistema deve manter sessão autenticada com expiração automática (duração configurável, 30 minutos por padrão); ao expirar, o usuário entra novamente. |

## Gestão de Patrimônio

| ID | Requisito |
|---|---|
| RF05 | O sistema deve permitir que o Galpão importe equipamentos via arquivo CSV no formato exportado pelo e-Pública. |
| RF06 | O sistema deve permitir que o Galpão cadastre um equipamento manualmente, informando: número de tombamento, descrição, unidade de localização, estado de conservação e flag de emenda parlamentar. |
| RF07 | O sistema deve garantir que o número de tombamento seja único e imutável após o cadastro. |
| RF08 | O sistema deve permitir que a Unidade consulte o inventário dos equipamentos sob sua responsabilidade. |
| RF09 | O sistema deve permitir que o Administrador consulte o inventário completo da rede, com filtros por unidade, tipo de equipamento, estado de conservação e status. |
| RF10 | O sistema deve registrar e exibir o histórico completo de movimentações e eventos de cada equipamento. |

## Manutenção

| ID | Requisito |
|---|---|
| RF11 | O sistema deve permitir que a Unidade abra uma solicitação de manutenção para um equipamento, informando apenas a descrição do problema (sem justificativa). |
| RF12 | O sistema deve permitir que o Administrador aprove ou negue uma solicitação de manutenção, com registro de justificativa. Depois da aprovação o Administrador não nega nem troca o item de contrato: o chamado segue com a terceirizada. |
| RF13 | O sistema deve alterar o status do equipamento para "em manutenção" após aprovação da solicitação. |
| RF14 | O sistema deve permitir que a empresa terceirizada (perfil Terceirizada) registre o orçamento da manutenção; o Administrador não registra orçamento. |
| RF15 | O sistema deve permitir que o Administrador aprove ou rejeite o orçamento registrado. |
| RF16 | O sistema deve permitir que o Administrador emita um laudo de baixa quando rejeitar o orçamento por o equipamento ser irrecuperável. Com a manutenção em execução, o Administrador não emite baixa nem marca retorno: quem confirma que o reparo terminou é a terceirizada. |
| RF17 | O sistema deve abrir automaticamente uma solicitação de novo item ao Administrador quando um laudo de baixa for emitido. |
| RF18 | O sistema deve permitir que a Unidade e o Administrador confirmem o retorno do equipamento após a manutenção, registrando o estado pós-serviço. |
| RF19 | O sistema deve registrar o custo e a data de cada manutenção no histórico do equipamento. |
| RF47 | O sistema deve permitir que a Unidade abra um chamado de **manutenção civil** (problema em unidade, sala ou instalação, como vazamento, infiltração ou problema elétrico), sem equipamento com patrimônio, informando título, local afetado, tipo de problema, descrição e até 4 fotos opcionais. A manutenção civil usa a mesma numeração (MAN-0001), a mesma conversa e o mesmo histórico da manutenção de equipamento. |
| RF48 | Na triagem do chamado civil, o Administrador deve ver os chamados em aberto da mesma unidade e do mesmo tipo de problema (para evitar atendimento duplicado), conferir se o serviço é manutenção (e não alteração de estrutura ou layout, que pode ter outra cobertura) e encaminhá-lo escolhendo um item de contrato cujo escopo cubra manutenção civil, com vigência e saldo. Sem cobertura ou saldo, o chamado fica **aguardando providências**, não é enviado à empresa e pode ser encaminhado depois ou negado. |
| RF49 | O sistema deve informar a Unidade quando o chamado civil for encaminhado, indicando o prestador e o contrato responsáveis. |
| RF55 | O sistema deve permitir que a Terceirizada do contrato, enquanto ele está aguardando orçamento, com orçamento registrado, aguardando execução ou em execução, **solicite o reencaminhamento** informando apenas o motivo em texto (10 a 500 caracteres). O chamado passa ao status **Reencaminhamento Solicitado** e entra nas Pendências do Administrador, que só age sobre o chamado depois desse pedido. |
| RF56 | O sistema deve permitir que o Administrador **confirme** o reencaminhamento e, só então, **decida o destino**: (a) abrir um **novo chamado de manutenção** (equipamento ou civil), que nasce em `PENDENTE_APROVACAO` na triagem de sempre, sem contrato, prestador, orçamento ou responsável do atendimento anterior; ou (b) **baixar o equipamento** pelo fluxo de baixa já existente (laudo em PDF e substituição automática). Ao decidir, o atendimento anterior fecha como **Concluída** (ou **Baixado**, no caso da baixa) e permanece intacto. |
| RF57 | O sistema deve ligar os atendimentos de um mesmo caso: cada novo chamado guarda o atendimento de origem e a raiz do caso, e a substituição gerada pela baixa guarda o chamado que a originou. O detalhe da manutenção exibe a **Trajetória do caso** (todos os atendimentos, em ordem, com situação, prestador e motivo do reencaminhamento), disponível a quem já enxerga o chamado: a Unidade vê as etapas da própria unidade e a Terceirizada identifica e abre apenas os chamados do próprio prestador, sem ver prestadores de outros contratos nem a baixa. |
| RF50 | No chamado civil não há orçamento prévio. Encaminhado o chamado, o prestador o vê como **aguardando execução** e marca **iniciar execução**. Ao concluir, ele **confirma a finalização informando os serviços e materiais executados**, escolhidos na **tabela SINAPI** com a quantidade; ele não digita preço. O preço unitário é o da tabela com o **desconto do item de contrato** (proposta vencedora, cadastrado no contrato), congelado na linha junto com o código, o preço de tabela e o percentual usados. Só se confirma a finalização com ao menos um item. O total dos itens é o custo do chamado e não pode exceder o saldo do item de contrato. |
| RF51 | Depois que a Unidade confirma que o problema foi resolvido (ou contesta, devolvendo o chamado à execução), o Administrador dá a **aprovação final**, que autoriza a medição e conclui o chamado, ou **solicita ajustes** com motivo: o chamado volta à execução, o valor deixa de ocupar o saldo, o prestador é avisado e corrige os itens; ao finalizar de novo, o chamado volta **direto ao Administrador** (sem nova confirmação da Unidade). |
| RF52 | Terminado o reparo, o prestador confirma a conclusão e a Unidade confirma que o problema foi resolvido (ou contesta, e o chamado volta à execução com o motivo registrado). Depois da confirmação da Unidade, o Administrador **autoriza a medição**, o que conclui o chamado e finaliza o consumo do saldo do item de contrato no valor do orçamento aprovado. |

## Cessão de Uso

| ID | Requisito |
|---|---|
| RF20 | O sistema deve permitir que a Unidade solicite a cessão de uso de um equipamento para outra unidade, informando justificativa e unidade de destino. |
| RF21 | O sistema deve permitir que o Administrador aprove ou negue uma solicitação de cessão de uso. |
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
| RF29 | O sistema deve permitir que o Administrador aprove ou negue a solicitação, vinculando a aprovação a uma ata de registro de preços. |
| RF30 | O sistema deve permitir que o Galpão registre a entrada física do novo equipamento e realize o cadastro com tombamento. |
| RF36 | O sistema deve distinguir dois tipos de estoque no Galpão: estoque interno (equipamentos sob guarda física do galpão) e estoque Branet (registro oficial de saída). O Galpão deve poder visualizar e atualizar cada estoque separadamente. |
| RF37 | O sistema deve permitir que o Galpão confirme o despacho físico de um equipamento para uma unidade de destino, atualizando o estoque interno. |

## Controle de Atas

| ID | Requisito |
|---|---|
| RF31 | O sistema deve permitir que o Administrador cadastre atas de registro de preços, informando valor total, saldo disponível e data de vencimento. |
| RF32 | O sistema deve atualizar automaticamente o saldo da ata quando o pedido da solicitação vinculada é lançado no Branet. Ao vincular, o saldo disponível já desconta os valores comprometidos em outras solicitações reservadas, e o saldo nunca fica negativo. |
| RF33 | O sistema deve alertar o Administrador quando uma ata estiver com vencimento em até 30 dias, vencida ou com saldo inferior a 10% do valor total. O mesmo critério de vencimento (até 30 dias / expirado) e de saldo inferior a 10% aplica-se aos contratos ativos do Administrador; a Terceirizada vê esses riscos só nos contratos do próprio prestador. |
| RF53 | Na Home, o sistema deve exibir as **Pendências** do perfil autenticado (ações que dependem dele), com contagem e link para a lista filtrada: Administrador (filas de decisão, orçamento, medição, Branet, validação, estoque, retorno e empréstimo atrasado, além dos riscos de ata/contrato); Unidade (recebimento, recolha, saída/retorno de empréstimo e retorno de manutenção); Galpão (estoque baixo ou zero do próprio galpão); Terceirizada (orçamento, início e execução das manutenções do prestador, além dos riscos dos próprios contratos). |
| RF54 | Na Home, o sistema deve exibir **Atualizações** in-app por usuário (aprovação, negação, avanços e retornos de solicitação/manutenção), com leitura própria. O e-mail institucional continua; o aviso in-app é criado após a transação. O Administrador também recebe atualizações quando Unidade ou Terceirizada devolvem trabalho à sua fila. Motivos longos aparecem truncados no aviso (texto completo no chamado). Avisos lidos há mais de 90 dias são removidos. Mensagens de chat não entram neste painel. |

## Conversa

| ID | Requisito |
|---|---|
| RF38 | O sistema deve permitir que os participantes de uma solicitação ou de uma manutenção conversem dentro dela por mensagens de texto (até 2.000 caracteres), em ordem cronológica, sem edição ou exclusão. Participam os perfis que já enxergam o registro (solicitação: Administrador, Unidade e Galpão; manutenção: Administrador, Unidade e Terceirizada do contrato), e a Unidade só vê conversas da própria unidade. |
| RF39 | Quando uma mensagem é enviada por quem não é da unidade, o sistema deve avisar a unidade por e-mail, sem incluir o conteúdo da mensagem. |
| RF40 | O sistema deve oferecer o menu Conversas, com a lista das conversas que o usuário pode ver (ordenadas pela mensagem mais recente) e uma tela dedicada para cada conversa. Os Gestores veem na lista só as conversas em que estão envolvidos (escreveram, criaram ou decidiram o pedido) e a fila dos pedidos pendentes sem decisão; Unidade e Galpão veem as da sua unidade e as solicitações, respectivamente. |
| RF41 | O sistema deve atribuir a cada solicitação e a cada manutenção um número sequencial legível e imutável (formato SOL-0001 e MAN-0001), exibi-lo nas listas, nos detalhes e nas conversas e permitir buscar por ele. |
| RF42 | O sistema deve gerar para cada equipamento um QR Code que leva direto à sua tela de detalhes (impresso como etiqueta, por um ícone ao lado do tombamento, com tombamento, descrição e unidade). O QR contém apenas o endereço; quem o lê precisa estar autenticado e ter permissão para ver o equipamento. |
| RF43 | O detalhe do equipamento deve oferecer à unidade dona, enquanto o item está ativo, os botões "Abrir manutenção" e "Abrir solicitação", que levam aos respectivos formulários com o equipamento já escolhido. |
| RF44 | Ao abrir manutenção ou solicitação, quem não encontrar o equipamento na lista deve ter um link "Fale com o atendimento" que abre o WhatsApp do atendimento com a mensagem pré-escrita; o número é configurado pelo Administrador em Configurações › Atendimento e o link some se não houver número. |
| RF45 | O sistema deve indicar ao usuário as mensagens não lidas: contador no menu Conversas, conversas não lidas em destaque, contador no título da aba e, no Início, a lista das conversas com mensagens novas. A leitura é individual: uma mensagem é lida quando a pessoa abre a conversa com a aba visível. Os indicadores se atualizam sozinhos (a cada 30 s e ao ler ou enviar). |
| RF46 | O sistema deve exigir um título (até 80 caracteres) ao abrir cada solicitação e cada manutenção, para reconhecê-las nas listas, no detalhe, nas conversas, nos relatórios de empréstimos e cessões e na busca; nas listas aparecem o número do pedido e, embaixo, o título. Os pedidos criados antes dessa regra receberam, por migração, um título gerado ("<tipo> · <nome do item>", como "Ampliação · Autoclave Vertical 75L"); os abertos pelo próprio sistema (como a substituição gerada por uma baixa) não têm título e seguem identificados pelo nome do item. Numa abertura com vários itens, todas as solicitações criadas recebem o mesmo título. |

## Relatórios

| ID | Requisito |
|---|---|
| RF34 | O sistema deve exibir para o Administrador, em Relatórios, cinco relatórios: visão geral (funil de solicitações por tipo e ranking de unidades por volume), manutenções (situação, custo, tempo médio, prestadores e itens que mais geram manutenção), empréstimos (prazos e devoluções), cessões de uso (prestação de contas) e itens e estoque (itens aguardando disponibilidade). |
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
| RNF04 | O sistema deve utilizar autenticação segura. A senha não é guardada no SGP: a autenticação é delegada ao Keycloak da Prefeitura (OpenID Connect com PKCE) e a sessão do SGP é um JWT de curta duração. |
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
| RN03 | Somente o Administrador pode aprovar solicitações de manutenção, validar orçamentos, emitir laudos de baixa, aprovar cessões de uso e novos itens. Como um único perfil reúne as duas áreas, não há mais separação de funções entre quem decide manutenções e quem decide patrimônio: toda decisão fica registrada na auditoria (quem, o quê, quando). |
| RN04 | (Unificada em RN03.) |
| RN05 | O empréstimo entre unidades não requer aprovação do Administrador, mas deve ser registrado no sistema pela unidade cedente. |
| RN06 | Durante um empréstimo, o tombamento do equipamento permanece vinculado à unidade de origem. A unidade receptora aparece apenas como detentora temporária. |
| RN07 | A emissão de um laudo de baixa por impossibilidade de manutenção deve gerar automaticamente uma solicitação de novo item no nome da unidade de origem do equipamento. |
| RN08 | Uma ata de registro de preços vencida não pode ser vinculada a novas solicitações de aquisição. |
| RN09 | O saldo de uma ata não pode ficar negativo. O sistema deve impedir aprovações que ultrapassem o saldo disponível. |
| RN10 | Itens adquiridos por emenda parlamentar devem ser sinalizados com flag específica no cadastro, visível em todos os relatórios e históricos. |
| RN12 | Na manutenção civil não há equipamento a bloquear nem dar baixa e não existe orçamento prévio nem revisão de orçamento. O escopo de um item de contrato só serve a um chamado civil se estiver marcado como cobrindo manutenção civil. O saldo do item segue a regra geral: o valor só é conhecido na finalização informada pelo prestador e passa a ocupar o saldo nesse momento (a finalização é recusada se exceder o saldo); contestação da Unidade ou pedido de ajustes liberam o valor, e ele fica definitivo quando o Administrador dá a aprovação final. Após pedido de ajustes do Administrador, a nova finalização do prestador volta direto à aprovação final — a Unidade não confirma de novo. |
| RN13 | Cada atendimento de um caso tem número, status, conversa, custo e fechamento próprios; o fechamento de um não bloqueia a abertura do seguinte. Há **um atendimento ativo por caso** (reencaminhamento sequencial). A decisão do reencaminhamento acontece uma única vez: confirmações e decisões simultâneas são recusadas (a condição de status vai na própria gravação). O equipamento continua em manutenção enquanto o caso segue com ele e é liberado se o novo chamado não o envolver; se o novo chamado for negado na triagem, o equipamento volta a ativo. Um atendimento encerrado por reencaminhamento **sem custo final** não ocupa o saldo do item de contrato (o serviço não foi feito); com custo final apurado, ocupa. Nos indicadores de volume (Relatórios › Visão geral) o caso conta uma vez, pelo atendimento de origem; o relatório de Manutenções conta cada atendimento no seu prestador. |
| RN11 | Terminado o reparo, a terceirizada confirma a conclusão. A confirmação de retorno da manutenção exige então validação de dois atores: a Unidade (como usuária do equipamento) e o Administrador (como fiscal do contrato). |

## Fora do Escopo

- **Tabela SINAPI**: hoje o sistema tem só dois itens de exemplo (seed, valores demonstrativos). Ficam para depois a importação da planilha mensal da Caixa, a referência por mês/UF/desoneração, o item livre fora da tabela (precificado pelo Administrador) e o BDI.
- **Medição da manutenção civil** (agrupamento dos serviços por prestador e período, gastos por unidade, preços de referência, BDI e desconto): prevista, mas depende de a fórmula ser validada com a equipe. Hoje o sistema só registra a **autorização da medição** de cada chamado (data e responsável na auditoria); a medição usará os chamados concluídos. A divisão de responsáveis (prestador informa os serviços executados; Unidade confirma a resolução; Administrador dá a aprovação final ou pede ajustes) segue o desenho atual até a equipe definir outra.

Itens explicitamente excluídos do escopo deste projeto (seção 2.6 do RFC):

- Integração técnica (via API) com GLPI, SEI, e-Pública ou Branet — entrada de dados desses sistemas é manual ou via CSV.
- Gestão de insumos e materiais de consumo (medicamentos, insumos hospitalares).
- Gestão financeira e contábil (depreciação, balanço patrimonial, normas do MCASP).
- Módulo de licitação e compras — o sistema só registra atas já existentes.
- Aplicativo mobile nativo — apenas web responsiva.
- Gestão de empenhos orçamentários.
- Controle de frota de veículos.
