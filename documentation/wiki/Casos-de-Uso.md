# Casos de Uso

Extraído da seção 2.2 do [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf). Veja também [Requisitos Funcionais](Requisitos-Funcionais) para o detalhamento de cada regra.

## Personas

| Persona | Perfil no sistema | Resumo |
|---|---|---|
| Administrador | `OPERADOR` | Reúne o que antes eram os perfis Gestor de Patrimônio e Gestor de Manutenção: visão geral do inventário e relatórios; aprova cessões de uso e novos itens e vincula aprovações a atas; é o fiscal dos contratos com terceirizadas (aprova manutenções, valida orçamentos, emite laudos de baixa); administra usuários, unidades e demais cadastros em Configurações. |
| Unidade de Atendimento | `UNIDADE` | Servidores das UBS, UME, CAC e demais unidades; abrem solicitações de manutenção, cessão, empréstimo e novos itens. |
| Galpão (Felipe) | `GALPAO` | Entrada e saída física de equipamentos no armazenamento central; confirma recebimentos e despachos. |
| Terceirizada | `TERCEIRIZADA` | Usuário de uma empresa prestadora de serviço, vinculado a um prestador. Vê só as manutenções e os contratos do próprio prestador; lança o orçamento, confirma que o reparo terminou e conversa com o Administrador e a Unidade. |
| Sistema (automático) | — | Perfil não humano — ex.: abre automaticamente uma solicitação de novo item após um laudo de baixa (RN07). |

## Módulo de Patrimônio

- **UC01 — Importar patrimônio via CSV**: o Galpão importa um arquivo CSV exportado do e-Pública para popular o sistema com o inventário inicial.
- **UC02 — Cadastrar o item manualmente**: o Galpão cadastra um novo equipamento com número de tombamento, unidade de destino, estado de conservação e flag de emenda parlamentar.
- **UC03 — Consultar inventário da unidade**: a Unidade consulta a lista de equipamentos registrados sob sua responsabilidade.
- **UC04 — Consultar inventário geral**: o Administrador consulta o inventário completo da rede com filtros por unidade, tipo de equipamento e estado.

## Módulo de Manutenção

- **UC05 — Solicitar manutenção**: a Unidade abre uma solicitação de manutenção para um equipamento específico, informando apenas a descrição do problema. Pode partir do botão "Abrir manutenção" no detalhe do equipamento (item já escolhido) ou escolher o item na lista; se não o encontrar, usa o link para o atendimento por WhatsApp.
- **UC06 — Aprovar ou negar manutenção**: o Administrador analisa a solicitação e aprova ou nega, registrando o motivo. Depois da aprovação o chamado fica com a terceirizada: o Administrador só volta a agir se ela pedir o reencaminhamento (UC09c).
- **UC07 — Registrar orçamento**: **só a terceirizada** do contrato lança o orçamento da manutenção aprovada. O Administrador não registra orçamento (ele aprova ou rejeita o orçamento em UC08). O orçamento não pode exceder o saldo do item de contrato; a partir de 50% do preço de referência do item, o Administrador recebe um alerta de manutenção não sugerida.
- **UC08 — Validar orçamento**: o Administrador aprova ou rejeita o orçamento. Se rejeitado, emite laudo de baixa (única porta de entrada da baixa por manutenção) e o sistema abre automaticamente uma solicitação de novo item. Depois de aprovado, com a manutenção em execução, o Administrador não age: a terceirizada confirma a conclusão do reparo (UC09).
- **UC09 — Confirmar retorno do equipamento**: quando o reparo termina, a **terceirizada confirma a conclusão** (com o custo final, que não pode ser zero nem passar do orçamento aprovado; sem orçamento não há retorno); em seguida a Unidade e o Administrador confirmam o retorno do equipamento, registrando o estado pós-manutenção.
- **UC09b — Manutenção civil**: a Unidade abre o chamado em Nova solicitação › Manutenção › Natureza **Civil** (local afetado, tipo de problema, descrição, fotos; sem equipamento). O Administrador faz a triagem (chamados parecidos em aberto, cobertura, item de contrato civil com saldo) e encaminha ao prestador, ou deixa o chamado **aguardando providências** (sem contrato ou saldo), ou nega. O prestador vê o chamado como **aguardando execução** (não há orçamento prévio) e **inicia a execução**; ao terminar, **confirma o reparo concluído informando os serviços e materiais executados**, escolhidos na tabela SINAPI com a quantidade (o preço vem da tabela com o desconto do item de contrato). A Unidade confirma que o problema foi resolvido ou contesta (volta à execução). Por fim o Administrador dá a **aprovação final**, que autoriza a medição e conclui o chamado (status *Aguardando Medição* até então), ou **solicita ajustes** com motivo, o que devolve o chamado à execução; quando o prestador finaliza de novo, o chamado volta direto ao Administrador, sem passar outra vez pela Unidade. A medição em si ainda não existe.
- **UC09a — Conversar sobre a manutenção**: a terceirizada participa do chat das manutenções do seu contrato, com o Administrador e a Unidade.
- **UC09c — Reencaminhar um chamado**: a Terceirizada que atende clica em *Reencaminhar* (ao lado de *Conversar*) e escreve o motivo; o chamado fica em *Reencaminhamento Solicitado*. O Administrador lê o motivo, confirma e escolhe: abrir um novo chamado de manutenção (vai para a triagem, sem prestador) ou baixar o equipamento. O atendimento anterior fecha e o histórico completo aparece na *Trajetória do caso*, de qualquer chamado do caso. Exemplo: ar-condicionado que não liga → Manutenção Civil vistoria e pede reencaminhamento → novo chamado de equipamento com a empresa especializada → laudo indica baixa → baixa e substituição.

## Módulo de Cessão de Uso

- **UC10 — Solicitar cessão de uso**: a Unidade solicita a transferência de um equipamento para outra unidade, com justificativa.
- **UC11 — Aprovar ou negar cessão**: o Administrador aprova ou nega a solicitação.
- **UC12 — Confirmar saída e recebimento**: a unidade de origem confirma a saída e a unidade de destino confirma o recebimento, atualizando o tombamento.

## Módulo de Empréstimo

- **UC13 — Registrar empréstimo**: a Unidade A registra um empréstimo para a Unidade B, com data prevista de retorno.
- **UC14 — Avaliar o estado do equipamento**: a Unidade B registra o estado do equipamento no recebimento, assumindo responsabilidade.
- **UC15 — Confirmar retorno**: a Unidade A confirma o retorno do equipamento e encerra o empréstimo.

## Módulo de Novos Itens

- **UC16 — Solicitar novo item**: a Unidade solicita a aquisição de um novo equipamento, informando tipo, quantidade, justificativa e origem do recurso.
- **UC17 — Aprovar solicitação**: o Administrador aprova e vincula a solicitação a uma ata de registro de preços disponível.
- **UC18 — Registrar entrada no galpão**: o Galpão registra a chegada do equipamento e realiza o cadastro com tombamento.

## Módulo de Atas

- **UC19 — Cadastrar ata de registro de preços**: o Administrador cadastra uma ata com valor total, saldo disponível e data de vencimento.
- **UC20 — Consultar saldo de ata**: o Gestor consulta o saldo atualizado e o vencimento das atas ativas.

## Módulo de Conversa

- **UC26 — Conversar dentro de uma solicitação ou manutenção**: os participantes trocam mensagens de texto no próprio registro (por exemplo, o Gestor pede um esclarecimento e a Unidade responde). A conversa abre em uma tela dedicada, pelo botão **Conversar** do próprio registro ou pelo menu **Conversas** (com a lista de todas as conversas do usuário) e a unidade é avisada por e-mail quando o Gestor escreve. Mensagens ainda não lidas aparecem como contador no menu, no título da aba e no Início; para os Gestores, a lista mostra só as conversas em que estão envolvidos.

## Módulo de Relatórios

- **UC21 — Consultar relatórios gerenciais**: o Administrador consulta cinco relatórios — visão geral (funil de solicitações e unidades que mais solicitam), manutenções (UC21a), empréstimos, cessões de uso e ampliação (itens aguardando estoque) — filtrando por período, unidade e item.
- **UC21a — Relatório de manutenções**: o Administrador acompanha as manutenções por período (abertura), unidade, item, **prestador de serviço**, **situação** (em andamento, concluídas, negadas, baixadas) e busca (número MAN-0007, tombamento, descrição ou título). Mostra o total e a divisão por situação; o **custo total** (custo final, ou o orçamento enquanto o reparo não termina; negadas e baixadas não custam); o **tempo médio de conclusão** (da abertura à conclusão, só das concluídas); quantas manutenções estão com orçamento a partir de 50% do preço de referência (**manutenção não sugerida**); o **custo por mês**; os **itens com mais manutenções** (candidatos a reposição); o resumo por **prestador**; e a tabela das manutenções com orçamento, custo final e situação. Os totais somam até as 5.000 manutenções mais recentes do filtro (com aviso quando passa disso) e a tabela mostra as 200 mais recentes.

## Módulo de Contratos

- **UC22 — Gerenciar contratos de manutenção**: o Administrador cadastra e edita contratos (prestador de serviço, descrição, vigência, status e **itens**); também exclui. O prestador é escolhido em lista e cada item combina um **tipo de serviço** do catálogo, um **escopo** (ex.: Manutenção preventiva, Manutenção corretiva, Manutenção preventiva e corretiva) e um valor individual. O mesmo serviço não se repete no contrato; o valor total é a soma dos itens, calculada pelo servidor. Contratos anteriores aos itens mantêm o valor que já tinham até que os itens sejam informados; depois disso o contrato precisa de ao menos um item.
- **UC22a — Gerenciar prestadores, tipos de serviço e escopos** (Configurações › Serviços, Administrador): cadastros simples (prestador: nome, CNPJ, telefone e e-mail; tipo de serviço e escopo: nome e descrição). Em Configurações, **Itens** reúne Categorias e Tipos de itens, e **Serviços** reúne Prestadores, Tipos e Escopos. Prestador com contratos, tipo de serviço e escopo em uso não podem ser excluídos.
- **Vínculo da manutenção com o contrato**: ao aprovar, o Administrador **precisa** escolher um **item de contrato** (tipo de serviço + escopo), listado agrupado por contrato com o saldo de cada item. Só aparecem itens de contrato vigente, **com saldo** (valor do item menos o custo final — zero não conta, cai no orçamento —, ou o orçamento das manutenções já vinculadas; negadas e baixadas não consomem) e de **escopo compatível**: o tipo de item informa se aceita manutenção preventiva, corretiva, ambas ou **nenhuma** (tipo que não permite manutenção: a abertura do chamado é recusada), e o escopo informa o que cobre; um item que só aceita corretiva só vê escopos que cobrem corretiva. A API repete todas as validações e trava a linha do item. O saldo só é consumido no orçamento (ou no custo final); a aprovação recusa item já esgotado. O contrato da manutenção é o do item. Um item vinculado a manutenções não pode ser removido do contrato, nem ter o escopo trocado; o prestador do contrato também não muda se já houver manutenção ligada.
- **Alerta de orçamento alto**: o tipo de item tem um **preço de referência** (o mesmo do cadastro, sem campo extra). Quando o orçamento registrado pela terceirizada é **igual ou superior a 50%** desse preço, o Administrador vê, na decisão do orçamento, um alerta de **"Manutenção não sugerida"** com o valor, o percentual e o preço de referência, recomendando avaliar a rejeição e a baixa. É só um aviso: não bloqueia o orçamento nem a decisão, e sem preço de referência cadastrado não há alerta. O orçamento também não pode exceder o saldo do item de contrato.

## Módulo de Configurações

- **UC23 — Gerenciar usuários e unidades**: o Administrador cadastra e edita usuários (e-mail, perfil, unidade e situação; o acesso é pela conta institucional, sem senha no SGP) e unidades (tipo, endereço, e-mail e responsável).
- **UC24 — Gerenciar categorias e tipos de itens**: o Administrador mantém as categorias e os tipos de itens (código, nome, preço de referência e imagem) usados no inventário e nas solicitações.

## Manutenção como tipo de solicitação (telas)

- **UC27 — Ver manutenções junto das solicitações**: a lista de **Solicitações** mostra também as manutenções, como o tipo **Manutenção**, ordenadas da mais recente para a mais antiga. A manutenção mantém o próprio número (`MAN-0007`), o próprio fluxo e a própria página de detalhe; não há mais o item "Manutenções" no menu. O filtro de tipo e o de status acompanham o tipo escolhido (em "Todas" valem os status das duas). O **Administrador** e a **Unidade** veem as duas; o **Galpão** só solicitações; a **Terceirizada** só as manutenções do seu contrato.
- **UC28 — Abrir uma manutenção pelo formulário de solicitação**: em **Nova solicitação**, a **Unidade** escolhe o tipo **Manutenção**, informa título, o equipamento da própria unidade e a descrição do problema. O envio cria uma manutenção (e não uma solicitação). O link "Abrir manutenção" do inventário e os links antigos de nova manutenção abrem esse formulário já no tipo Manutenção.
- A **Visão geral** dos relatórios trata a manutenção como mais um tipo: entra no funil (em andamento, concluídas e canceladas — negadas e baixadas), no ranking de unidades e no total.
