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
| [Requisitos Funcionais](Requisitos-Funcionais) | RF01–RF44, requisitos não funcionais (RNF) e regras de negócio (RN) |
| [Casos de Uso](Casos-de-Uso) | UC01–UC26, organizados por módulo, e as 5 personas de usuário |
| [Arquitetura](Arquitetura) | Diagramas C4 (Contexto, Containers, Componentes), stack tecnológica e modelo de dados |
| [Deploy e Instalação](Deploy-e-Instalação) | Variáveis de ambiente, como rodar local (com e sem Docker) e como funciona o deploy automatizado |

O guia de UX está em [`documentation/DESIGN-SYSTEM.md`](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/DESIGN-SYSTEM.md) e as instruções para agentes de IA em [`AGENTS.md`](https://github.com/victor-moy/gestao-patrimonio/blob/main/AGENTS.md).

## Visão geral do sistema

O SGP atende cinco perfis de usuário — Gestor de Patrimônio, Gestor de Manutenção, Unidade de Atendimento, Galpão e um perfil automático do próprio Sistema — em torno de sete módulos principais:

- **Inventário** — cadastro e consulta de equipamentos por número de tombamento (único e imutável), com importação via CSV e QR Code por equipamento (leva direto ao detalhe).
- **Manutenções** — fluxo completo: solicitação → aprovação → orçamento da terceirizada → validação → execução ou laudo de baixa → confirmação dupla de retorno.
- **Solicitações** — cinco tipos de fluxo: Substituição, Ampliação (novos itens), Cessão de Uso, Empréstimo e Recolha entre unidades. Solicitações e manutenções têm uma conversa interna entre os participantes.
- **Estoque** — controle do que está no Galpão aguardando destinação, incluindo itens represados por falta de saldo em ata.
- **Atas e Contratos** — saldo e vencimento de atas de registro de preços vinculadas às aprovações de novos itens; contratos das empresas terceirizadas de manutenção.
- **Relatórios** — quatro relatórios, um por submenu (visão geral com funil de solicitações e ranking de unidades, empréstimos, cessões de uso e itens aguardando estoque), com filtros por período, unidade e item.
- **Configurações** — Gestor de Patrimônio: usuários e perfis (inclusive redefinição de senha), unidades, categorias de itens e tipos de itens; também permite entrar como outro usuário, com um clique na lista, para testes (auditado).

Mais contexto sobre o problema, benchmark de soluções existentes e justificativa de escopo está no [RFC v1.0](https://github.com/victor-moy/gestao-patrimonio/blob/main/documentation/RFC.pdf).
