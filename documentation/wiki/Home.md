# Sistema de Gestão de Patrimônio (SGP)

Sistema web para gestão do patrimônio físico da Secretaria Municipal de Saúde de Joinville — centraliza o ciclo de vida dos equipamentos (cadastro, manutenção, cessão de uso, empréstimo entre unidades e baixa) e elimina a dependência de planilhas manuais e sistemas desconectados.

Projeto de Portfólio — Engenharia de Software, Católica SC. Autor: Victor Moy da Cruz.

## Links rápidos

- 🌐 [Ambiente de demonstração](https://sgp.yomlabs.io)
- 💻 [Repositório no GitHub](https://github.com/victor-moy/gestao-patrimonio)
- 📄 [RFC v1.0 completo](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf) — visão do produto, problema, benchmark e objetivos

## Páginas desta Wiki

| Página | Conteúdo |
|---|---|
| [Requisitos Funcionais](Requisitos-Funcionais) | RF01–RF37, requisitos não funcionais (RNF) e regras de negócio (RN) |
| [Casos de Uso](Casos-de-Uso) | UC01–UC21, organizados por módulo, e as 5 personas de usuário |
| [Arquitetura](Arquitetura) | Diagramas C4 (Contexto, Containers, Componentes), stack tecnológica e modelo de dados |
| [Deploy e Instalação](Deploy-e-Instalação) | Variáveis de ambiente, como rodar local (com e sem Docker) e como funciona o deploy automatizado |

## Visão geral do sistema

O SGP atende cinco perfis de usuário — Gestor de Patrimônio, Gestor de Manutenção, Unidade de Atendimento, Galpão e um perfil automático do próprio Sistema — em torno de seis módulos principais:

- **Inventário** — cadastro e consulta de equipamentos por número de tombamento (único e imutável), com importação via CSV.
- **Manutenções** — fluxo completo: solicitação → aprovação → orçamento da terceirizada → validação → execução ou laudo de baixa → confirmação dupla de retorno.
- **Solicitações** — cinco tipos de fluxo: Substituição, Ampliação (novos itens), Cessão de Uso, Empréstimo e Recolha entre unidades.
- **Estoque** — controle do que está no Galpão aguardando destinação, incluindo itens represados por falta de saldo em ata.
- **Atas e Contratos** — saldo e vencimento de atas de registro de preços vinculadas às aprovações de novos itens; contratos das empresas terceirizadas de manutenção.
- **Relatórios** — dashboards analíticos (funil de solicitações, prazos de empréstimo, prestação de contas de cessões, itens aguardando estoque) com filtros por período, unidade e item.

Mais contexto sobre o problema, benchmark de soluções existentes e justificativa de escopo está no [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf).
