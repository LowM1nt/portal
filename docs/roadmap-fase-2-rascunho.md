# Roadmap da fase 2 — RASCUNHO (aguarda aprovação do dono)

> Rascunho feito a partir do plano (seções 5.1, 5.2 e 5.4). **O agente não usa este arquivo**:
> os itens só entram no `ROADMAP.md` depois de aprovados. Itens de tela ficam bloqueados até o
> **padrão visual** (`docs/ui/`) existir — decisão do dono em 20/11/2026.

**Meta da fase 2 (do plano):** o portal ganha o bot de bugs e o roadmap; começa o MVP do CRM.
Troca de fase quando o MVP estiver no ar com demo pública. Ritmo: 1 PR por noite no portal e 1 no CRM.

## Decisões que faltam (antes de começar)

| # | Pergunta | Recomendação |
| --- | --- | --- |
| D-006 | Bot de bugs: Discord, Slack ou os dois? | **Discord primeiro** (já usamos; API simples); Slack depois, pela mesma interface |
| D-007 | Quem paga o LLM que lê o relato do bug no portal? | **Chave do próprio workspace** (o time configura); sem chave, o bug entra sem extração |
| D-008 | CRM: login próprio (Auth.js, como no plano) ou o mesmo Supabase do portal? | **Auth.js**, como no plano: stack diferente de propósito, mostra repertório |
| D-009 | CRM: um usuário só (freelancer) ou equipes? | **Um usuário por conta** no MVP; equipe vira fase 3 |

## Portal — bot de bugs e roadmap

| Id | Item | Nível | Superfície | Depende de |
| --- | --- | --- | --- | --- |
| P-024 | Bugs: modelo de dados (título, relato, passos, esperado × obtido, severidade, origem, status) e API por workspace | padrao | api, dados | — |
| P-025 | Bot de bugs no Discord: um canal configurado por workspace vira bug "a triar" | padrao | api | P-024, D-006 |
| P-026 | Extração por LLM: relato livre → campos estruturados e severidade sugerida (com a chave do workspace) | padrao | api | P-025, D-007 |
| P-027 | Tela de bugs: lista, filtros e detalhe | padrao | ui | P-024, **padrão visual** |
| P-028 | Roadmap: modelo de dados e API (itens, status, prazo, ligação com PRs e deploys) | padrao | api, dados | — |
| P-029 | Tela do roadmap (quadro por status e linha do tempo) | padrao | ui | P-028, **padrão visual** |

## CRM — MVP (repo novo `crm`)

Stack do plano: Next.js + TypeScript, Postgres (Drizzle), Tailwind com componentes do padrão visual, Auth.js.

| Id | Item | Nível | Depende de |
| --- | --- | --- | --- |
| C-001 | Esqueleto: Next.js, Drizzle, Auth.js, CI, CodeQL, Semgrep, um teste por camada | padrao | D-008 |
| C-002 | Contatos e leads: modelo, ações do servidor e testes | padrao | C-001 |
| C-003 | Tela de contatos e leads | padrao | C-002, **padrão visual** |
| C-004 | Pipeline em kanban (estágios, arrastar, valor por estágio) | padrao | C-002, **padrão visual** |
| C-005 | Propostas (itens, valor, status, PDF simples) | padrao | C-002 |
| C-006 | Controle de horas por cliente e projeto | padrao | C-002 |
| C-007 | IA: resumo do lead e próximo passo sugerido | padrao | C-002, D-007 |
| C-008 | Demo pública do CRM com dados fictícios | padrao | C-003, C-004 |

## Ordem sugerida

1. Sem tela e sem decisão pendente: **P-024**, **P-028**.
2. Com as decisões D-006 a D-009: **P-025**, **P-026**, **C-001**, **C-002**, **C-005**, **C-006**, **C-007**.
3. Com o padrão visual pronto: **P-027**, **P-029**, **C-003**, **C-004**, **C-008**.
