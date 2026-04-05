# RFC: Request for Comments — Projeto de Portfólio

**Engenharia de Software — Católica SC**

---

## Identificação

| Campo | Valor |
|---|---|
| **Título do Projeto** | Sistema de Gestão de Patrimônio |
| **Linha de Projeto (Direction)** | Web |
| **Autor** | Victor Moy da Cruz |
| **Data da Proposta** | 12/04/2026 |
| **Versão** | 1.0 |

---

## 1. Visão do Produto e Impacto (O Problema)

> O objetivo desta seção é responder uma pergunta fundamental: **este projeto resolve um problema real ou é apenas um exercício técnico?**

---

### 1.1 Contexto e Problema

A Secretaria Municipal de Saúde de Joinville gerencia um extenso patrimônio físico distribuído por aproximadamente **60 unidades de atendimento** da rede pública — incluindo UBS (Unidades Básicas de Saúde), UME e CAC. Esse patrimônio engloba cerca de **180 autoclaves** e centenas de outros equipamentos médicos e de infraestrutura, cada um identificado individualmente por número de tombamento.

O problema central é a ausência de uma solução integrada de gestão. Atualmente, as informações são mantidas em **planilhas dispersas**, sem padronização nem centralização. A equipe de patrimônio recorre a múltiplos sistemas para operações distintas: o **GLPI** para abertura de chamados de manutenção, o **Branet/DOWS** para recolha de materiais, o **e-Público** para o cadastro inicial dos itens e o **SEI** para tramitação de documentos. Nenhum desses sistemas "conversa" entre si, e o resultado é uma visão fragmentada e defasada do patrimônio real.

**Consequências práticas da falta de integração:**

- Impossibilidade de visualizar, em tempo real, o estado de conservação de cada equipamento por unidade.
- Ausência de histórico consolidado de manutenção: um equipamento pode ter ido à assistência técnica diversas vezes sem que isso esteja registrado em lugar algum.
- Cessões de equipamentos entre unidades ocorrem de forma verbal, sem registro, gerando perda de rastreabilidade do tombamento.
- Saldo e vencimento das atas de registro de preços, que governam as aquisições, são controlados manualmente e estão sujeitos a erro humano.
- Relatórios gerenciais inexistem: toda análise depende de consolidação manual de múltiplas planilhas, processo lento e propenso a inconsistências.

---

### 1.2 Origem da Demanda e Evidências

O projeto foi solicitado pela **Secretaria Municipal de Saúde de Joinville**, mais especificamente pelo setor de Gestão de Patrimônio. A demanda emergiu de reuniões diretas com o gestor responsável pelo setor, que identificou e relatou as principais dores operacionais do departamento.

Foi realizada **1 entrevista aprofundada** com o gestor do setor de patrimônio da Secretaria. As principais dores identificadas foram:

- Ausência de histórico de manutenção por equipamento, impedindo análise de recorrência e custo.
- Impossibilidade de visualizar saldo e vencimento das atas de registro de preços em tempo real.
- Falta de rastreabilidade nas cessões e movimentações de equipamentos entre unidades.
- Ausência de dashboards e relatórios gerenciais: toda informação é extraída manualmente de planilhas.

Como evidência concreta do engajamento do parceiro, o documento de fluxograma do ciclo de vida do patrimônio (Versão 1) foi encaminhado ao gestor para validação. O gestor retornou com **13 comentários estruturados** sobre o documento, propondo ajustes de nomenclatura, inclusão de novos perfis de usuário e detalhamento de fluxos, o que resultou na elaboração da Versão 2 do fluxograma. Esse processo evidencia interesse real e participação ativa do parceiro na definição do escopo.

> 📎 *Imagem: print do documento de fluxograma com os comentários do gestor (a ser adicionada)*

---

### 1.3 Análise de Soluções Existentes (Benchmark)

Foram investigadas quatro soluções existentes que atendem, parcialmente, ao mesmo problema de gestão de patrimônio público.

#### AfixPat — Afixcode

- **Link:** https://www.afixcode.com.br/softwares/sistema-de-controle-patrimonial/
- **Público-alvo:** Órgãos públicos e empresas privadas.
- **Funcionalidades principais:** Controle patrimonial contábil com cálculo de depreciação fiscal e societária, movimentações em grupo, transferências, baixas parciais, controle multi-filial e conformidade com o MCASP (Manual de Contabilidade Aplicada ao Setor Público).
- **Limitações:** Foco eminentemente contábil-financeiro. Não contempla fluxo de manutenção com terceirizadas (orçamento, laudo, validação de fiscal de contrato), nem gestão de solicitações por unidades de atendimento, nem dashboards analíticos operacionais.

#### Fiorilli Software — SCPI Patrimônio

- **Link:** https://fiorilli.com.br
- **Público-alvo:** Prefeituras e entidades públicas municipais.
- **Funcionalidades principais:** Gestão de movimentação física e financeira dos bens, depreciação automática, controle de veículos e equipamentos, manutenção preventiva e inventário. Integrado a ERP público completo.
- **Limitações:** Sistema genérico de gestão municipal, sem customização para fluxos específicos de secretaria de saúde. Não oferece controle de atas de registro de preços com saldo e vencimento, nem fluxo de solicitação e aprovação por perfil de unidade de atendimento.

#### GLPI

- **Link:** https://glpi-project.org/pt-br
- **Público-alvo:** Equipes de TI em empresas e órgãos públicos.
- **Funcionalidades principais:** Gestão de ativos de TI, helpdesk, tickets de chamado, histórico de manutenção, contratos e garantias. Open source e amplamente adotado no setor público brasileiro.
- **Limitações:** Concebido para ativos de TI. A própria secretaria já o utiliza para abertura de chamados, mas ele não suporta os fluxos específicos necessários: tombamento físico de equipamentos médicos, cessão de uso entre unidades de saúde, controle de atas de licitação e dashboards analíticos de gestão patrimonial.

#### Prodata Patrimônio

- **Link:** https://prodata.inf.br/portfolio-2/patrimonio/
- **Público-alvo:** Órgãos públicos municipais.
- **Funcionalidades principais:** Gestão desde a aquisição até a baixa do bem, movimentação entre departamentos e inventário físico.
- **Limitações:** Módulo genérico integrado a ERP municipal sem customização para saúde. Sem gestão de manutenção com terceirizadas e validação de orçamento, sem controle de atas e sem dashboards de indicadores operacionais.

#### Comparação entre Soluções

| Solução | Pontos Fortes | Limitações | Diferencial vs. Projeto |
|---|---|---|---|
| AfixPat | Conformidade MCASP; depreciação contábil | Sem fluxo de manutenção; sem dashboards | Sem gestão operacional de saúde |
| Fiorilli SCPI | ERP municipal completo; manutenção preventiva | Genérico; sem atas; sem perfis por unidade | Não atende fluxos específicos de saúde |
| GLPI | Open source; tickets; histórico manutenção TI | Focado em TI; sem tombamento físico; sem atas | Já usado pela secretaria, mas insuficiente |
| Prodata Patrimônio | Gestão do ciclo completo do bem | Genérico; sem manutenção com terceirizadas | Sem fluxo de cessão e empréstimo entre unidades |

#### Diferencial do Projeto

Nenhuma das soluções analisadas contempla o conjunto específico de necessidades da Secretaria Municipal de Saúde de Joinville. Em particular, não existe no mercado uma solução que combine:

- Rastreamento individual de equipamentos por tombamento com histórico completo de manutenção (incluindo etapas de orçamento, validação de fiscal de contrato e laudo de baixa);
- Fluxo de cessão de uso e empréstimo temporário entre unidades de saúde, com rastreabilidade do tombamento;
- Controle de saldo e vencimento de atas de registro de preços vinculado à solicitação de novos itens;
- Dashboards analíticos com indicadores operacionais específicos para gestão de patrimônio médico-hospitalar.

Adicionalmente, a secretaria já opera múltiplos sistemas com contratos vigentes, o que inviabiliza a substituição por soluções genéricas. O novo sistema atua como **camada de centralização e inteligência** sobre os dados que hoje são inseridos manualmente nessas ferramentas.

---

### 1.4 Público-Alvo

O sistema será utilizado por **cinco perfis distintos** de usuários, com níveis de acesso e responsabilidades diferenciados:

- **Gestor de Patrimônio:** Profissional da Secretaria responsável pela visão geral do inventário. Aprova ou nega solicitações de cessão de uso e de novos itens, vincula aprovações às atas de registro de preços e acessa todos os dashboards. Conhecimento técnico de sistemas: médio-alto.

- **Gestor de Manutenção:** Fiscal do contrato com as empresas terceirizadas de manutenção. Aprova solicitações de manutenção, valida orçamentos retornados pela terceirizada, acompanha o ciclo completo e emite laudos de baixa quando o equipamento é irrecuperável. Conhecimento técnico: médio.

- **Unidade de Atendimento:** Servidores das UBS, UME, CAC e demais unidades da rede. Realizam solicitações de manutenção, de cessão de uso, de empréstimo e de novos itens, além de consultar e validar o próprio inventário. Nível técnico variável; a interface deve ser simples e intuitiva.

- **Galpão:** Equipe responsável pela entrada e saída física de equipamentos no espaço de armazenamento central. Confirma recebimentos, despachos e realiza o cadastro inicial do tombamento após chegada de novos itens. Conhecimento técnico: básico.

- **Sistema (automático):** Perfil não humano que executa ações automáticas sem intervenção manual. Exemplo: abertura automática de solicitação de novo item após a emissão de um laudo de baixa por impossibilidade de manutenção.

---

### 1.5 Objetivos do Projeto

#### Objetivo Geral

Desenvolver um sistema web de gestão de patrimônio físico para a Secretaria Municipal de Saúde de Joinville, centralizando o ciclo de vida dos equipamentos — do cadastro à baixa — e oferecendo dashboards analíticos para suporte à decisão gerencial, eliminando a dependência de planilhas manuais e dispersas.

#### Objetivos Específicos

1. Implementar o cadastro individual de equipamentos por número de tombamento, com importação via CSV do sistema e-Público e identificação de itens adquiridos por emenda parlamentar.
2. Desenvolver o módulo de manutenção com fluxo completo: solicitação pela unidade, aprovação pelo Gestor Manutenção, programação com terceirizada, validação de orçamento, execução ou emissão de laudo de baixa, e retorno com validação dupla.
3. Implementar os módulos de cessão de uso e empréstimo entre unidades, com rastreabilidade de tombamento e registro do estado do equipamento pelo receptor.
4. Desenvolver o módulo de controle de atas de registro de preços, com gestão de saldo disponível e vencimento, vinculado ao fluxo de aprovação de novos itens.
5. Criar dashboards analíticos com indicadores operacionais: patrimônio por unidade, itens em manutenção, tempo médio de manutenção, histórico de custos semestrais e unidades que mais solicitam.

---

### 1.6 Métricas de Sucesso (KPIs)

O projeto será considerado bem-sucedido quando os seguintes critérios forem atendidos:

- **Cobertura do inventário:** 100% dos equipamentos da rede cadastrados com tombamento individual no sistema, importados via CSV ou cadastro manual inicial.
- **Rastreabilidade:** Histórico de manutenção disponível para cada equipamento desde a entrada no sistema, com registros de custo e tempo de cada ocorrência.
- **Velocidade de consulta:** Localização de um equipamento específico em menos de 30 segundos, em comparação ao processo manual atual de busca em múltiplas planilhas.
- **Dashboards ativos:** Pelo menos 5 indicadores operacionais disponíveis e atualizados em tempo real na tela inicial do gestor.
- **Adoção:** Pelo menos 3 perfis de usuário (Gestor Patrimônio, Unidade de Atendimento e Galpão) ativos e utilizando o sistema nos primeiros 60 dias após a implantação.
