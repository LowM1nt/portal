# Roadmap do portal — fase 1

Formato de cada item (o agente precisa de itens pequenos, com os arquivos-alvo, para não gastar
tokens explorando o repo):

- **id e título**
- **nível:** `barato`, `padrao` ou `dificil` (difícil é decomposto ou vai para a fila de difíceis)
- **repo e superfícies:** `api`, `ui`, `dados`
- **arquivos:** onde mexer
- **aceite:** o que precisa ser verdade, incluindo vazio, erro e carregando
- **testes:** o que os testes de aceite cobrem

Estados: `[ ]` a fazer · `[~]` em andamento · `[x]` mergeado · `[!]` na fila de difíceis

**Meta da fase 1:** MVP no ar com demo pública — calendário de deploy, fila de PRs, integração com
GitHub e o painel (visão geral e performance). Só então começa a fase 2.

---

- [x] **P-001 — Esqueleto do monorepo**
  - nível: padrao
  - repo: portal · superfícies: api, ui
  - arquivos: `apps/web/`, `apps/api/`, `apps/painel/`, `docker-compose.yml`, `projeto.yaml`
  - aceite: os três apps compilam; cada um tem um teste que passa; `docker compose up` sobe a API e o Postgres
  - testes: um teste trivial por app (prova que o runner funciona)

- [x] **P-002 — CI, CodeQL, Semgrep e Dependabot**
  - nível: barato
  - repo: portal · superfícies: nenhuma (infra)
  - arquivos: `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.semgrep/invariantes.yml`, `.github/dependabot.yml`
  - aceite: uma PR de teste mostra todos os checks; a branch `main` exige os checks para o merge
  - testes: a própria execução do CI

- [x] **P-003 — Design system no front**
  - nível: barato
  - repo: portal · superfícies: ui
  - arquivos: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/components.css`, o mesmo em `apps/painel/`
  - aceite: os dois apps usam os tokens do Madrugada; o tema escuro é o padrão e o claro entra por `data-theme="light"`
  - testes: teste de componente confirma a troca de tema

> **Prioridade (Noite 4 do CHECKLIST):** o painel vem antes do resto da fase 1. O login do painel
> (Supabase Auth, só o dono) já existe em `apps/painel/src/App.tsx`; os itens abaixo partem dele.

- [x] **P-012 — Painel: visão geral**
  - nível: padrao
  - repo: portal · superfícies: ui
  - arquivos: `apps/painel/src/features/visao-geral/`
  - pré-requisito: login do painel (pronto); tabelas `eventos`, `sincronizacao` e `comandos` no Supabase (prontas)
  - aceite: a linha da noite, os 4 números, as tarefas da noite, o próximo post e "precisa de você", como na prévia do design system; mostra "última sincronização"; o botão "Pausar agente" grava o comando
  - testes: componente com dados de uma noite e com noite vazia

- [x] **P-013 — Painel: performance do agente**
  - nível: padrao
  - repo: portal · superfícies: ui
  - arquivos: `apps/painel/src/features/performance/`, `apps/painel/src/App.tsx` (abas "Visão geral" e "Performance" com `.abas` do design system)
  - dados: **só os eventos de `docs/eventos.md`** (`tarefa_metricas`, `noite_resumo`, `fallback_acionado`); não inventar tipo novo
  - aceite: depois do login, a aba Performance mostra PRs por noite, taxa de aprovação nos portões, tokens por tarefa, fila de difíceis (valor do `noite_resumo` mais recente, não do período) e acionamentos do fallback, por período (7 ou 30 dias); consulta com limite explícito; `null` não entra na média; estados vazio, erro (com "Tentar de novo" que volta para carregando) e carregando
  - testes: componente com dados de uma semana; a aba aparece no App e troca a visão; o cliente falso confere o filtro de período usado na consulta
- [x] **P-004 — API: autenticação e workspaces**
  - nível: padrao
  - repo: portal · superfícies: api, dados
  - decisões: `docs/decisoes.md` (D-001) e o contrato da API de lá — não reabrir
  - arquivos: `apps/api/src/Portal.Api/Auth/` (validação do JWT do Supabase, `UsuarioAtual` scoped), `apps/api/src/Portal.Api/Workspaces/` (entidades, `WorkspaceAtual` scoped, endpoints), `apps/api/src/Portal.Api/Dados/` (DbContext, query filter global, migration), `apps/api/tests/Portal.Api.Tests/` (testes de integração)
  - aceite: `GET /api/me` cria o workspace pessoal no 1º acesso e lista os workspaces do usuário; `POST /api/workspaces` cria; `GET /api/workspaces/{id}` devolve 404 para quem não é membro; sem token → 401; CORS só para a origem do web; migrations só em Development
  - testes: integração com `WebApplicationFactory` e tokens assinados no teste (chave de teste no lugar do JWKS): dois usuários, dois workspaces — os dados de um nunca aparecem no outro; 401 sem token; 404 para outro dono
  - fora do escopo: qualquer arquivo em `apps/web/` (é o P-014)

- [x] **P-014 — Web: login e workspace ativo**
  - nível: padrao
  - repo: portal · superfícies: ui
  - pré-requisito: P-004 (contrato da API em `docs/decisoes.md`)
  - arquivos: `apps/web/src/supabase.ts`, `apps/web/src/features/auth/` (`AuthProvider.tsx`, `apiClient.ts` que envia `Authorization` e `X-Workspace-Id`), `apps/web/src/App.tsx`
  - aceite: entrar com Supabase Auth (mesmo padrão do painel); depois do login, `GET /api/me` define o workspace ativo (o primeiro da lista), com seletor quando houver mais de um; sair limpa a sessão; estados carregando, erro com "Tentar de novo" e sem sessão
  - testes: componente com cliente do Supabase e `fetch` falsos: sem sessão mostra o login; com sessão chama `/api/me` com o Bearer; o `apiClient` envia `X-Workspace-Id` do workspace ativo; 401 da API volta para o login
- [ ] **P-005 — Modelo de dados: repositório, deploy e PR**
  - nível: padrao
  - repo: portal · superfícies: dados
  - arquivos: `apps/api/Dados/`, migrations do EF Core
  - aceite: migrations aplicam do zero; índices por workspace e por data; nenhuma coluna duplicada
  - testes: integração com Testcontainers aplicando as migrations

- [ ] **P-006 — API de deploys**
  - nível: padrao
  - repo: portal · superfícies: api
  - arquivos: `apps/api/Deploys/DeploysController.cs`, `apps/api/Deploys/DeploysService.cs`
  - aceite: criar, listar por semana (`GET /api/deploys?semana=AAAA-Www`), editar e cancelar; tudo filtrado pelo workspace; validação com mensagem clara
  - testes: integração do caminho feliz, das bordas e de "outro workspace deve ser recusado"

- [ ] **P-007 — Tela do calendário**
  - nível: padrao
  - repo: portal · superfícies: ui
  - arquivos: `apps/web/src/features/calendario/`
  - aceite: semana com um cartão por deploy; navegar entre semanas; estados vazio, erro e carregando; no celular vira lista
  - testes: componente nos quatro estados

- [ ] **P-008 — Integração com GitHub: PRs e status de CI**
  - nível: dificil (decompor: cliente da API · importação de PRs · status de CI · agendamento)
  - repo: portal · superfícies: api, dados
  - arquivos: `apps/api/Integracoes/GitHub/`
  - aceite: importa as PRs abertas dos repositórios cadastrados, com status de CI; respeita o limite da API; falha do GitHub não derruba o portal
  - testes: contrato com respostas gravadas da API

- [ ] **P-009 — Fila de revisão de PRs**
  - nível: padrao
  - repo: portal · superfícies: api, ui
  - arquivos: `apps/api/Revisoes/`, `apps/web/src/features/revisoes/`
  - aceite: lista as PRs aguardando revisão, com filtro por repositório e por quem revisa; estados vazio, erro e carregando
  - testes: integração da API e componente da lista

- [ ] **P-010 — Demo pública com dados fictícios**
  - nível: padrao
  - repo: portal · superfícies: api, ui, dados
  - arquivos: `apps/api/Demo/`, script de dados fictícios
  - aceite: um workspace de demonstração, só leitura, com dados fictícios; a URL da demo abre sem login
  - testes: a demo não aceita escrita

- [x] **P-011 — Eventos e sincronização com o painel**
  - nível: padrao
  - repo: agente · superfícies: dados
  - arquivos: `bin/fila-saida`, `sql/`
  - aceite: os eventos locais chegam ao Supabase pela fila de saída; sem internet, ficam pendentes e sobem depois, sem duplicar
  - testes: enviar, cair a conexão no meio e reenviar

