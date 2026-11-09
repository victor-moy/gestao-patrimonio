# Roteiro de testes dos fluxos (1 a 6)

Roteiro para testar à mão, no ambiente local, cada etapa e cada cenário dos seis tipos de solicitação do SGP. A ordem dos fluxos é a da tela **Nova solicitação**.

| # | Fluxo | Quem abre |
|---|---|---|
| 1 | Substituição | Unidade |
| 2 | Ampliação | Unidade |
| 3 | Cessão de uso | Administrador (quem tem `SOLICITACOES_GERENCIAR`) |
| 4 | Empréstimo | Unidade |
| 5 | Recolha | Unidade |
| 6 | Manutenção (6A equipamento, 6B civil) | Unidade |

Como usar: siga os passos na ordem e marque `[x]`. Cada passo tem **quem age**, **onde** e **o que deve acontecer** (status esperado). Se o resultado for diferente do esperado, anote ao lado: é um defeito ou uma regra mal entendida. Os trechos marcados com *(confira)* são pontos em que o roteiro foi escrito a partir do código e o texto exato da tela pode variar.

---

## 0. Preparação

### 0.1 Usuários do ambiente de teste

Para trocar de usuário sem sair: menu do usuário (canto superior direito) › **Entrar como**. A sessão dura 30 minutos; se expirar, entre de novo.

| Nome | Perfil | O que faz nos testes |
|---|---|---|
| AA Unidade | Unidade, UBS Norte | Abre solicitações, confirma saída, recebimento, retorno e recolha |
| Rodrigo Silva | Unidade, UBS Centro | Segunda unidade (destino do empréstimo, teste de isolamento entre unidades) |
| CC Admin | Operador com todas as permissões | É o "Administrador": aprova, nega, lança no Branet, fiscaliza, avalia |
| DD Triador | Operador: triar, escrever, consultar, solicitações | Triagem dos chamados de manutenção |
| EE Avaliador | Operador: avaliar, vistoriar, solicitações, atas, estoque, inventário | Avaliação técnica e vistoria |
| BB Terceirizado | Terceirizada, **LabEquip Serviços** | Manutenção de equipamento (contrato CONT-2024-045, só calibração) |

**Falta um usuário para o fluxo 6B (civil).** Os serviços civis estão no contrato **CONT-2025-001 (TecSaúde)**, e o BB é da LabEquip. Antes do fluxo 6B crie um usuário em Configurações › Usuários › Novo, com perfil **Terceirizada** e prestador **TecSaúde Manutenção Hospitalar Ltda.** Neste roteiro ele se chama **TC**.

- [ ] TC criado (perfil Terceirizada, prestador TecSaúde)
- [ ] Consigo entrar como cada um dos usuários acima pelo "Entrar como"

### 0.2 Dados que existem

- **Atas:** 052/2024 (saldo R$ 12.500, vence 01/12/2026) e 045/2025 (saldo R$ 180.000, vence 25/05/2027).
- **Estoque de galpão:** Autoclave Vertical 21L (8), Autoclave Vertical 75L (2), Centrífuga de Bancada (3), Geladeira Hospitalar 300L (4), Microscópio Binocular (8).
- **Serviços do contrato TecSaúde (civil):** Cobertura e telhado *(exige orçamento prévio)*, Instalações elétricas *(exige avaliação técnica)*, Serviço de manutenção predial *(vai direto ao prestador)*.
- **Tipos de problema civil:** Hidráulica, Elétrica (com a pergunta "Há risco de choque elétrico?"), Infiltração, Alvenaria e pintura, Cobertura, Esquadrias e vidros, Climatização, Outros.
- **Inventário:** confira em Inventário quais equipamentos ativos cada unidade tem. No seed, a UBS Norte tem 12346/2024 e 12351/2024, e a UBS Centro tem 12345/2024, 12350/2023 e 12352/2024. O seu banco pode ter mudado.

Para os testes de saldo e de estoque, **anote os valores antes e depois**: saldo da ata, estoque do tipo e saldo do item de contrato.

### 0.3 Regras que valem para todos os fluxos (confira em cada um)

- [ ] **Negar** só existe antes da aprovação; depois de aprovada, a solicitação não pode ser negada.
- [ ] Todo passo importante aparece no **Histórico** do detalhe, com quem fez e quando.
- [ ] O **chat** ("Conversar") funciona entre os envolvidos, e só quem enxerga a solicitação enxerga a conversa.
- [ ] Uma Unidade **não vê** nem age nas solicitações da outra (teste com Rodrigo Silva).
- [ ] Estoque e saldo de ata **nunca ficam negativos**.
- [ ] Botões de ação só aparecem para quem pode agir naquela etapa.

---

## Fluxo 1. Substituição

Troca um equipamento com defeito por um novo. Uma solicitação é criada **por item**.

### Caminho principal (com estoque)

1. - [ ] **AA Unidade** › Nova solicitação › **Substituição**. Preencher título, escolher o equipamento a substituir da UBS Norte, a **justificativa daquele item**, o tipo de reposição e a quantidade. Enviar.
   Esperado: uma solicitação por item, `Pendente Aprovação` (SOL-000x).
2. - [ ] **CC Admin** abre a solicitação › **Aprovar**, informando a **prioridade (1 a 3)**.
   Esperado: como há estoque do tipo, vai direto a `Reservado`, e o estoque do tipo diminui.
3. - [ ] **CC Admin** › **Lançar no Branet**: número do pedido e o **tombamento de cada item** (com descrição e data de aquisição).
   Esperado: `Aguardando Entrega`. Surge o equipamento novo na UBS Norte, o equipamento antigo vira `Baixado` (motivo substituição), e, se havia ata, o saldo dela diminui.
4. - [ ] **AA Unidade** › **Confirmar recebimento** › **OK**, informando o tombamento de cada item.
   Esperado: `Aguardando Validação`.
5. - [ ] **CC Admin** › **Validar/Concluir**.
   Esperado: `Concluída`.

### Cenários alternativos

| Cenário | Passos | Esperado |
|---|---|---|
| **1.A Negar** | CC Admin nega a solicitação `Pendente Aprovação`, com motivo | `Negada`, o motivo aparece. Não dá para negar depois de aprovada |
| **1.B Sem estoque** | Peça uma quantidade maior que o estoque (ex.: 3 unidades da Autoclave Vertical 75L, que tem 2). CC Admin aprova | `Aguardando Disponibilidade` (o solicitante não vê ata nem saldo) |
| **1.C Sair de "Aguardando Disponibilidade" pela ata** | CC Admin › **Vincular ata**: ata 045/2025 e valor estimado | `Reservado`. O saldo só é consumido no Branet (no vínculo ele só fica comprometido) |
| **1.D Ata inválida** | Vincule a ata **vencida** (ajuste a data de uma ata para o passado), ou com valor **acima do saldo** | Erro claro: ata vencida / saldo insuficiente. O status não muda |
| **1.E Sair pela entrada de estoque** | Em Estoque, dê **entrada** do tipo faltante. Depois, na solicitação, **Tentar reservar estoque** *(confira o nome do botão)* | `Reservado`. Sem estoque suficiente, erro e continua aguardando |
| **1.F Dois pedidos disputando** | Duas solicitações aguardando e uma única entrada de estoque. Tente reservar nas duas | Só uma reserva; a outra continua aguardando (o Administrador escolhe qual atender) |
| **1.G Recebimento "Não OK"** | AA recebe com **Não OK** e escreve a observação | `Aguardando Validação`. A observação é obrigatória (sem ela, erro) |
| **1.H Tombamento divergente** | AA confirma OK mas digita um tombamento diferente do lançado | Vira "não OK" sozinho, com a observação "Divergência de patrimônio: esperado X, informado Y" |
| **1.I Ajustar tombamento** | Com divergência, CC Admin **ajusta o tombamento** (só vale em `Aguardando Validação`) e conclui | Tombamento corrigido; único caso em que o tombamento muda. Depois de `Concluída` não dá mais |
| **1.J Tombamento duplicado** | No Branet, use um tombamento que já existe | Erro "Tombamentos já cadastrados". Nada é gravado |
| **1.K Itens faltando no Branet** | Lance com menos tombamentos que itens | Erro pedindo o tombamento de todos os itens |
| **1.L Saldo da ata no Branet** | Reduza o saldo da ata para menos que o valor vinculado antes de lançar | Erro "Saldo insuficiente na ata". Saldo não fica negativo |
| **1.M Equipamento repetido** | Escolha o mesmo equipamento duas vezes no mesmo pedido | Erro: não pode aparecer duas vezes |
| **1.N Perfis indevidos** | Rodrigo Silva tenta confirmar o recebimento de uma solicitação da UBS Norte. CC Admin tenta confirmar o recebimento pela unidade | Recusado nos dois casos (só a unidade solicitante confirma) |
| **1.O Anexo opcional** | Anexe um PDF/imagem na criação | O anexo abre pelo detalhe (acesso protegido) |

Verificar ao final: equipamento antigo `Baixado`, novo no inventário da unidade, saldo da ata, estoque, histórico completo.

---

## Fluxo 2. Ampliação

Compra de item novo, sem retirar outro. Igual à Substituição, **sem o equipamento antigo** e **sem baixa**. A justificativa é única para o pedido.

1. - [ ] **AA Unidade** › Nova solicitação › **Ampliação**: título, justificativa, tipo de equipamento e quantidade de cada item. Esperado: `Pendente Aprovação`.
2. - [ ] **CC Admin** aprova com **prioridade**. Esperado: `Reservado` (há estoque) ou `Aguardando Disponibilidade`.
3. - [ ] **CC Admin** lança no **Branet** (pedido + tombamentos). Esperado: `Aguardando Entrega`, novos equipamentos na UBS Norte, **nenhum equipamento baixado**.
4. - [ ] **AA Unidade** confirma o recebimento (OK com tombamentos). Esperado: `Aguardando Validação`.
5. - [ ] **CC Admin** conclui. Esperado: `Concluída`.

Cenários: repita os da Substituição que se aplicam: **1.A** (negar), **1.B** a **1.F** (disponibilidade, ata, estoque, concorrência), **1.G** a **1.L** (recebimento e Branet), **1.N** e **1.O**. Especificidades da Ampliação:

| Cenário | Esperado |
|---|---|
| **2.A Vários itens** | Pedido com 2 tipos diferentes gera 2 solicitações, cada uma segue sozinha |
| **2.B Quantidade 2 do mesmo tipo** | No Branet, é preciso informar **2 tombamentos** para aquela solicitação |
| **2.C Prioridade obrigatória** | Aprovar sem prioridade dá erro |
| **2.D Sem item/quantidade** | Enviar sem tipo ou sem quantidade dá erro de validação |

---

## Fluxo 3. Cessão de uso

Ceder um item a uma **entidade externa**. Só o Administrador abre, a reserva do estoque é feita na criação e não há etapa de ata nem tombamento novo.

1. - [ ] **AA Unidade** abre Nova solicitação. Esperado: a opção **Cessão de uso não aparece**.
2. - [ ] **CC Admin** › Nova solicitação › **Cessão de uso**: título, justificativa, **entidade externa**, e por item o tipo de equipamento e o **nº de patrimônio** (1 unidade por item). Esperado: uma solicitação por item, já `Reservado`, e o estoque do tipo diminui.
3. - [ ] **CC Admin** › **Lançar no Branet**: número do pedido. Esperado: `Concluída` direto, sem tombamento novo.

| Cenário | Esperado |
|---|---|
| **3.A Estoque insuficiente** | Peça um tipo sem estoque: erro na hora, nada é criado (não fica aguardando) |
| **3.B Faltam dados** | Sem nº de patrimônio, sem entidade externa, sem justificativa ou sem item: erro específico para cada |
| **3.C Vários itens** | 2 itens do mesmo tipo (2 patrimônios) reservam 2 unidades e geram 2 solicitações |
| **3.D Quem não pode** | Operador sem `SOLICITACOES_GERENCIAR`: não vê a opção, e a chamada direta é recusada |
| **3.E Concluída** | Não existe retorno nem recebimento: confira que não há botões a mais |

---

## Fluxo 4. Empréstimo

A unidade de **origem** empresta equipamentos próprios para a unidade de **destino**. O equipamento continua sendo da origem; o destino passa a ter a guarda temporária.

1. - [ ] **AA Unidade (UBS Norte)** › Nova solicitação › **Empréstimo**: unidade de destino (UBS Centro), equipamentos próprios ativos, justificativa e **data final prevista**. Esperado: uma solicitação por item, `Pendente Aprovação`.
2. - [ ] **CC Admin** aprova. Esperado: `Aguardando Saída`.
3. - [ ] **AA Unidade (origem)** › **Confirmar saída**. Esperado: `Aguardando Retorno`. O equipamento fica `Emprestado`, **aparece no inventário da UBS Centro como detido por ela**, e a proprietária continua a UBS Norte.
4. - [ ] **AA Unidade (origem)** › **Confirmar retorno**. Esperado: `Concluída`, equipamento volta a `Ativo` e sai da UBS Centro.

| Cenário | Esperado |
|---|---|
| **4.A Negar** | CC Admin nega em `Pendente Aprovação`, com motivo: `Negada` |
| **4.B Origem = destino** | Erro: a unidade de destino deve ser diferente |
| **4.C Equipamento em manutenção** | Equipamento com chamado de manutenção aberto não pode ser emprestado: erro |
| **4.D Sem data ou sem justificativa** | Erros específicos |
| **4.E Mesmo equipamento duas vezes** | Erro |
| **4.F Saída por quem não pode** | CC Admin e Rodrigo Silva tentam **confirmar a saída**: recusado (só a origem) |
| **4.G Retorno por quem não pode** | O destino e o Administrador tentam **confirmar o retorno**: recusado (só a origem) |
| **4.H Retorno atrasado** | Confirme o retorno depois da data prevista (ajuste a data na criação para o passado). Esperado: o atraso fica registrado no histórico, **sem bloquear** |
| **4.I Manutenção do emprestado** | Com o item emprestado, a UBS Centro (destino) não abre manutenção dele; só a unidade dona abre |
| **4.J Empréstimo ativo e outros fluxos** | Equipamento `Emprestado` não entra em recolha nem em outro empréstimo *(confira a mensagem)* |

---

## Fluxo 5. Recolha

A unidade pede a recolha de equipamentos que já tem. O Administrador decide a etapa e o galpão; só ele move o equipamento no final.

1. - [ ] **AA Unidade** › Nova solicitação › **Recolha**: título, equipamentos ativos da unidade, justificativa. Esperado: `Pendente Aprovação`.
2. - [ ] **CC Admin** aprova, escolhendo **em qual etapa a recolha está** (aguardando o Patrimônio ou já lançada no Branet) e o galpão de destino *(confira os campos)*. Esperado: `Aguardando Entrega`.
3. - [ ] **AA Unidade (origem)** › **Confirmar recolha**. Esperado: `Aguardando Validação`. O equipamento ainda não mudou de unidade.
4. - [ ] **CC Admin** conclui (validação final). Esperado: `Concluída`, e **só agora** o equipamento muda para o galpão.

| Cenário | Esperado |
|---|---|
| **5.A Negar** | `Negada`, com motivo |
| **5.B Aprovar sem etapa** | Erro pedindo a etapa da recolha |
| **5.C Pular direto para a etapa do Branet** | Aprovar já na etapa "lançada no Branet" funciona e segue igual |
| **5.D Confirmação por quem não pode** | Administrador ou outra unidade confirmam a recolha: recusado |
| **5.E Equipamento não ativo** | Equipamento `Emprestado`, em manutenção ou baixado não entra na recolha: erro |
| **5.F Vários equipamentos** | 2 equipamentos geram 2 solicitações independentes |

---

## Fluxo 6. Manutenção

Quem abre é sempre a **Unidade**, e só para um item ou local da própria unidade. Há duas naturezas: **patrimonial (equipamento)** e **civil**. A manutenção tem número próprio (`MAN-000x`).

Atores da manutenção: **Unidade** (abre, confirma), **Triagem** (DD Triador ou CC Admin), **Avaliação** (EE Avaliador ou CC Admin), **Fiscal** (CC Admin: `MANUTENCAO_FISCALIZAR`) e **Terceirizada** (BB para equipamento, TC para civil).

### 6A. Manutenção de equipamento (patrimonial)

#### Caminho principal

1. - [ ] **AA Unidade** › Nova solicitação › **Manutenção** › natureza **Patrimonial**: escolher o equipamento da UBS Norte, título, descrição do problema, e deixar o interruptor "O item está na minha unidade" ligado. Esperado: `Pendente Aprovação` (MAN-000x).
2. - [ ] **DD Triador** › **Aprovar**, escolhendo o item de contrato (prestador LabEquip, serviço de calibração). Esperado: `Aguardando Orçamento`. Equipamento e saldo ficam reservados.
3. - [ ] **BB Terceirizado** › **Registrar orçamento** (valor e descrição). Esperado: `Orçamento Registrado`. O orçamento não pode passar do saldo do item.
4. - [ ] **CC Admin** (avaliar) › **Aprovar orçamento**. Esperado: `Em Andamento`.
5. - [ ] **BB Terceirizado** › **Finalizar**, com o **custo final** (não pode ser zero nem maior que o orçamento). Esperado: `Aguardando Retorno`.
6. - [ ] **AA Unidade** › **Confirmar retorno** (registrando o estado do equipamento) e **CC Admin** (fiscal) › **Confirmar retorno**. Esperado: com as **duas** confirmações, `Concluída`.

#### Cenários

| Cenário | Passos | Esperado |
|---|---|---|
| **6A.1 Negar** | Triador nega com motivo | `Negada`, equipamento e saldo liberados |
| **6A.2 Serviço que exige avaliação técnica** | Aprovar com um item cujo serviço exige avaliação *(crie esse serviço no contrato da LabEquip, ou use o fluxo civil)* | `Aguardando Avaliação Técnica`, item reservado, **terceirizada ainda não enxerga** |
| **6A.3 Orçamento rejeitado (baixa)** | CC Admin **rejeita o orçamento** com laudo de baixa (PDF) | Equipamento `Baixado`, chamado `Baixado`, e **abre sozinha uma solicitação de Substituição** (fluxo 1) *(confira o status inicial dela)* |
| **6A.4 Orçamento acima do saldo** | BB lança orçamento maior que o saldo do item | Erro; nada muda |
| **6A.5 Orçamento alto (alerta)** | Orçamento a partir de 50% do preço de referência do item | Administrador recebe o alerta de "manutenção não sugerida" (Relatórios/Início) |
| **6A.6 Custo final inválido** | Custo final 0, ou maior que o orçamento | Erro. Sem orçamento aprovado também não há finalização |
| **6A.7 Só uma confirmação** | Só a Unidade confirma o retorno | Continua `Aguardando Retorno` até o fiscal confirmar (e vice-versa) |
| **6A.8 Bloquear / desbloquear** | Triador bloqueia (motivo obrigatório) antes da execução, depois desbloqueia | `Bloqueado`; ao desbloquear volta ao status anterior; equipamento e saldo seguem reservados |
| **6A.9 Sem interação** | Na lista, filtro "chamados sem interação" | Mostra só os sem mensagem nem ação depois da abertura |
| **6A.10 Reencaminhamento** | BB clica **Reencaminhar** (motivo). CC Admin confirma e escolhe **novo chamado** ou **baixa** | `Reencaminhamento Solicitado`. Novo chamado nasce `Pendente Aprovação`, sem contrato, ligado ao anterior (que fica `Concluída`); a **Trajetória do caso** mostra os dois. Pela baixa, segue o fluxo de baixa |
| **6A.11 Equipamento em manutenção** | Com o chamado aberto, tente emprestar, recolher ou abrir outra manutenção do mesmo equipamento | Erro: equipamento em manutenção não participa de fluxo incompatível |
| **6A.12 Equipamento emprestado** | A unidade que só detém o item tenta abrir manutenção | Não consegue: só a unidade dona |
| **6A.13 Perfis** | Operador sem `MANUTENCAO_TRIAR` tenta aprovar; Unidade tenta aprovar; BB de outro prestador abre o chamado | Sem botões; BB de outro contrato não enxerga o chamado |

### 6B. Manutenção civil

Problema na unidade, sala ou instalação, **sem equipamento**. O caminho depende do serviço do item de contrato escolhido na triagem.

#### 6B.1 Abertura (Unidade)

1. - [ ] **AA Unidade** › Nova solicitação › **Manutenção** › natureza **Civil**.
   Preencher: setor(es) afetado(s) *(vários permitidos)*, **tipo de problema**, **as perguntas daquele tipo** (as obrigatórias bloqueiam o envio), descrição e fotos (até 4).
   Esperado: `Pendente Aprovação` (MAN-000x), com "Sobre o problema" mostrando a descrição e as respostas.

| Cenário | Passos | Esperado |
|---|---|---|
| **6B.1.a Chamados parecidos** | Abra outro chamado civil na mesma unidade e tipo | A tela lista "Já há chamados abertos deste tipo na sua unidade" |
| **6B.1.b Acrescentar a um existente** | Clique **Acrescentar a este** e envie | O problema vira "problema adicional" do chamado existente; **não** cria chamado novo. O botão só aparece se ele ainda está na triagem ou na avaliação |
| **6B.1.c Chamado já com o prestador** | Chamado parecido já em execução | Aparece "Já está com o prestador" no lugar do botão |
| **6B.1.d Outros problemas** | **+ Adicionar problema** no formulário (até 20) | Cada um vira "Problema adicional N" com descrição e fotos |
| **6B.1.e Acrescentar depois** | No detalhe, **+ Acrescentar problema** | Só enquanto `Pendente Aprovação` ou `Aguardando Avaliação Técnica` |
| **6B.1.f Validações** | Sem setor (quando a unidade tem setores), sem tipo, pergunta obrigatória em branco, descrição curta | Erro e o envio fica bloqueado |
| **6B.1.g Tipo sem perguntas** | Escolha um tipo sem perguntas | O chamado só pede a descrição |
| **6B.1.h Outra unidade** | Rodrigo Silva abre o detalhe do chamado da UBS Norte | Não vê |

#### 6B.2 Triagem (DD Triador ou CC Admin)

2. - [ ] **DD Triador** abre o chamado `Pendente Aprovação`. Só há duas saídas: **Aprovar** (escolhendo o item de contrato da TecSaúde) ou **Negar** (motivo). Veja o resultado conforme o item escolhido:

| Item de contrato escolhido | Status depois de aprovar | Siga para |
|---|---|---|
| **Serviço de manutenção predial** (sem exigências) | `Aguardando Execução`, prestador já enxerga | 6B.5 |
| **Instalações elétricas** (exige avaliação técnica) | `Aguardando Avaliação Técnica`, item reservado, **TC não enxerga** | 6B.3 |
| **Cobertura e telhado** (exige orçamento prévio) | `Aguardando Avaliação Técnica` (e **nenhum caminho leva ao prestador sem orçamento aprovado ou dispensa**) | 6B.3 e 6B.4 |

| Cenário | Esperado |
|---|---|
| **6B.2.a Negar** | `Negada` com o motivo; saldo e reserva liberados |
| **6B.2.b Saldo** | O saldo do item **não bloqueia** a escolha na triagem; ele só é conferido quando surge um valor (orçamento ou custo final) |
| **6B.2.c Bloquear** | `Bloqueado` com motivo obrigatório, em qualquer status antes da execução; **Desbloquear** volta ao mesmo status; o tempo parado é contado |
| **6B.2.d Sem interação** | Filtro da lista mostra os chamados sem mensagem nem ação |
| **6B.2.e Quem não pode** | Operador sem `MANUTENCAO_TRIAR` e Unidade não veem Aprovar/Negar/Bloquear |

#### 6B.3 Avaliação técnica (EE Avaliador ou CC Admin)

3. - [ ] **EE Avaliador** abre o chamado `Aguardando Avaliação Técnica`. A tela vira formulário editável. Dá para corrigir título, descrição, unidade, setor, local, tipo de problema, item de contrato (que define o prestador) e escrever as **orientações para a terceirizada** e o **parecer**. Dá para **prever materiais da tabela SINAPI** (entram como linhas do relatório).

Destinos possíveis (cada um é um cenário):

| Destino | Passos | Esperado |
|---|---|---|
| **6B.3.a Seguir em análise** | Só salvar | Continua `Aguardando Avaliação Técnica` com os campos salvos |
| **6B.3.b Encaminhar ao prestador** | Escrever o parecer e **Encaminhar** | `Aguardando Execução` (a menos que o serviço exija orçamento: ver 6B.4). Sem parecer, erro |
| **6B.3.c Pedir informações** | **Solicitar informações** com o motivo | Volta a `Pendente Aprovação` com o motivo em destaque e o **item de contrato limpo**; a triagem fala com o solicitante pelo chat e escolhe o item de novo |
| **6B.3.d Marcar vistoria** | **Marcar vistoria** | `Aguardando Vistoria`, **não vai ao prestador** |
| **6B.3.e Registrar vistoria** | Quem tem `MANUTENCAO_VISTORIAR` registra o parecer da visita | Volta a `Aguardando Avaliação Técnica`, e o **parecer da vistoria aparece** no box "Avaliação técnica" para quem decide de novo |
| **6B.3.f Aprovar e devolver à triagem** | **Devolver avaliado** | `Avaliado, a encaminhar` (fila "já avaliados"). O triador usa **Encaminhar ao prestador** (pode trocar o item) e vai a `Aguardando Execução` |
| **6B.3.g Encerrar** | Tipo **Encerrado**, **Duplicado** ou **Unificado** (os dois últimos pedem o nº do chamado original) | `Encerrada`: libera o saldo e **conta como negada nos relatórios**; mostra "Segue no chamado MAN-000y" |
| **6B.3.h Solicitar orçamento** | **Solicitar orçamento** com instruções | `Aguardando Orçamento`, rodada 1, o prestador já enxerga (ver 6B.4) |
| **6B.3.i Dispensar orçamento** | **Dispensar (risco à vida)**, justificativa de pelo menos 10 caracteres | Segue ao prestador sem orçamento, e a justificativa fica registrada ("Orçamento dispensado por risco à vida") |
| **6B.3.j Permissão** | Quem não tem `MANUTENCAO_AVALIAR` | Não vê o formulário nem os destinos |

#### 6B.4 Orçamento prévio (só no serviço que exige: Cobertura e telhado)

4. - [ ] Após **Solicitar orçamento** (6B.3.h): **TC (Terceirizada)** vê "O que orçar" e o campo **Orçamento (PDF)**. Anexa de 1 a 5 PDFs e clica **Enviar orçamento**. Esperado: `Orçamento Registrado`.
5. - [ ] **CC Admin (fiscal)** vê os links "Orçamento 1 (PDF)", "Orçamento 2 (PDF)" e o campo **Valor aprovado (R$)**. **Aprovar orçamento**. Esperado: `Aguardando Execução`, o valor aprovado vira o valor do orçamento e é conferido contra o saldo do item.

| Cenário | Esperado |
|---|---|
| **6B.4.a Rejeitar** | Fiscal clica **Rejeitar**, escreve o motivo: volta a `Aguardando Orçamento`, rodada seguinte; o prestador vê o motivo e os envios anteriores |
| **6B.4.b Reenvio** | TC envia novo PDF na rodada 2: `Orçamento Registrado` de novo |
| **6B.4.c Segunda entrega na mesma rodada** | Não deixa enviar de novo na mesma rodada |
| **6B.4.d Valor acima do saldo** | Aprovar com valor maior que o saldo do item: erro |
| **6B.4.e Sem valor** | O botão Aprovar fica desabilitado |
| **6B.4.f Arquivo inválido** | Envie algo que não é PDF (renomeie um .txt para .pdf): recusado. Mais de 5 arquivos: recusado |
| **6B.4.g Quem vê** | A **Unidade não vê** os arquivos do orçamento; TC não vê o valor |
| **6B.4.h Barreira** | Com serviço que exige orçamento, nem **Encaminhar** (avaliação) nem **Encaminhar avaliado** (triagem) levam ao prestador sem orçamento aprovado ou dispensa |

#### 6B.5 Execução (TC, a terceirizada)

6. - [ ] **TC** vê o chamado `Aguardando Execução` › **Gerar OS**: equipe, dia da visita, escopo. Esperado: `Em Andamento` (em rota), OS-000x criada (uma por chamado).
7. - [ ] **Qualquer perfil que veja o chamado** › menu **Ações** › **Imprimir OS**. Esperado: o diálogo de impressão abre com **uma página A4**, sem data/hora/endereço do navegador, com logo, tabelas, campos de entrada/saída, itens em branco, observações e as duas assinaturas.
8. - [ ] **TC** lança os **serviços e materiais executados**, escolhidos da tabela SINAPI, **só com a quantidade**. TC **não vê preços**.
9. - [ ] **TC** › **Marcar como executado**: entrada, saída (depois da entrada), resultado (total ou parcial) e observação. Esperado: `Doc. pendente`. O botão fica desabilitado sem itens lançados.
10. - [ ] **TC** envia a **OS assinada** (PDF) no card **Documentação**. Esperado: `Aguardando Retorno`.

| Cenário | Esperado |
|---|---|
| **6B.5.a Documento recusado** | **CC Admin (fiscal)** › Ações › **Recusar OS assinada** (motivo): o chamado volta a `Doc. pendente` e a Documentação mostra "Recusado em…: motivo"; TC envia outra OS |
| **6B.5.b Já enviado não se troca** | Com a OS assinada enviada, não há botão de enviar de novo |
| **6B.5.c Quem recusa** | Unidade e operador sem `MANUTENCAO_FISCALIZAR` não veem "Recusar OS assinada" |
| **6B.5.d Saída antes da entrada** | O botão fica desabilitado |
| **6B.5.e Remover item** | O X remove a linha enquanto está em execução |
| **6B.5.f Saldo excedido** | Se o total dos itens passar o saldo do item de contrato, o envio da OS/execução é recusado, e a mensagem para a terceirizada **não traz números** |
| **6B.5.g Chamado antigo sem OS** | Chamado que já estava em execução antes da OS existir oferece **Gerar OS** |

#### 6B.6 Confirmação da Unidade

11. - [ ] **AA Unidade** (dona do chamado) abre o chamado `Aguardando Retorno`. Duas saídas:

| Saída | Esperado |
|---|---|
| **Problema resolvido** | `Aguardando Medição` |
| **Contestar** (motivo) | O atendimento atual vira `Concluída` (valor **liberado do saldo**) e abre um **subchamado** em `Pendente Aprovação`, sem contrato nem prestador, com local, tipo, fotos e setores copiados, ligado pela **Trajetória do caso** |

| Cenário | Esperado |
|---|---|
| **6B.6.a Resolvido sozinho em 7 dias** | Se a Unidade não responder em 7 dias corridos, o job diário dá como resolvido (histórico "resolvido automaticamente", sem usuário). Para testar sem esperar, ajuste a data `aguardando_retorno_em` do chamado no banco para 8 dias atrás e rode/aguarde o job |
| **6B.6.b Quem confirma** | Só a Unidade dona (o chamado civil não tem a confirmação dupla do equipamento) |

#### 6B.7 Aprovação final (CC Admin, fiscal)

12. - [ ] **CC Admin** abre o chamado `Aguardando Medição`:

| Saída | Esperado |
|---|---|
| **Aprovar** | `Concluída` (autoriza a medição; a medição em si ainda não existe) |
| **Solicitar ajustes** (motivo) | Volta a `Em Andamento`, o saldo do item é liberado, TC vê o motivo |

| Cenário | Esperado |
|---|---|
| **6B.7.a Reenvio depois dos ajustes** | TC ajusta e **Marca como executado** de novo: o botão reenvia **direto**, o chamado volta a `Aguardando Medição` **sem nova confirmação da Unidade** |
| **6B.7.b Saldo no custo final** | O total dos itens vira o custo final e **ocupa o saldo** do item só nesse momento; custo final zero não libera saldo |

#### 6B.8 Reencaminhamento no civil

| Cenário | Esperado |
|---|---|
| **6B.8.a Pedir** | **TC** (atendendo) clica **Reencaminhar** e escreve o motivo: `Reencaminhamento Solicitado`. O Operador **não** pede, só age depois |
| **6B.8.b Confirmar e decidir** | **CC Admin** confirma e decide **uma vez**: novo chamado (nasce `Pendente Aprovação`, sem contrato, prestador nem orçamento; o atendimento anterior vira `Concluída`) ou baixa pelo fluxo existente |
| **6B.8.c Decisão concorrente** | Dois administradores decidindo ao mesmo tempo: o segundo é recusado |
| **6B.8.d Visibilidade** | A trajetória do caso não mostra a TC prestadores de outros contratos |

#### 6B.9 Cenários transversais do civil

| Cenário | Esperado |
|---|---|
| **Valores escondidos** | TC não vê preço, desconto, valor do item, custo final nem saldo em nenhuma tela |
| **Fotos protegidas** | As fotos só abrem para a unidade e para o prestador do contrato |
| **Conversas** | Mensagens no chat do chamado; e-mail de aviso nunca traz o texto da mensagem; lista de não lidas por perfil |
| **Auditoria** | Cada ação crítica aparece no Histórico, e as trocas de permissão guardam o antes e depois |
| **Permissões** | Remova uma permissão de DD Triador (Configurações › Usuários), **entre de novo** (a permissão vale no próximo login) e confirme que o botão sumiu |

---

## Verificação final (depois dos seis fluxos)

- [ ] Relatórios: a Visão geral, Manutenções, Empréstimos, Cessões e Ampliação batem com o que você fez (contagens, custos, encerradas como negadas).
- [ ] Estoque: as reservas e baixas dos fluxos 1, 2 e 3 conferem com o que você anotou.
- [ ] Atas: o saldo só diminuiu nos pedidos lançados no Branet.
- [ ] Inventário: equipamentos baixados, emprestados e recolhidos estão no status e na unidade corretos.
- [ ] Nenhum status ficou "preso": todo chamado tem uma ação possível para alguém, ou está em estado final.
- [ ] Mobile: abra o detalhe de uma solicitação e de uma manutenção na largura do celular e confira as listas, o menu **Ações** e os formulários.

### Estados finais por fluxo

| Fluxo | Estados finais possíveis |
|---|---|
| 1 e 2 | `Concluída`, `Negada` |
| 3 | `Concluída` |
| 4 | `Concluída`, `Negada` |
| 5 | `Concluída`, `Negada` |
| 6 | `Concluída`, `Negada`, `Encerrada`, `Baixado` (e o atendimento anterior vira `Concluída` quando há contestação ou reencaminhamento) |
