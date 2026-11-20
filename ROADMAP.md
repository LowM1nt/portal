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
- [x] **P-005 — Modelo de dados: repositório, deploy e PR**
  - nível: padrao
  - repo: portal · superfícies: dados
  - arquivos: `apps/api/Dados/`, migrations do EF Core
  - aceite: migrations aplicam do zero; índices por workspace e por data; nenhuma coluna duplicada
  - testes: integração com Testcontainers aplicando as migrations

- [x] **P-006 — API de deploys**
  - nível: padrao
  - repo: portal · superfícies: api
  - arquivos: `apps/api/Deploys/DeploysController.cs`, `apps/api/Deploys/DeploysService.cs`
  - aceite: criar, listar por semana (`GET /api/deploys?semana=AAAA-Www`), editar e cancelar; tudo filtrado pelo workspace; validação com mensagem clara
  - testes: integração do caminho feliz, das bordas e de "outro workspace deve ser recusado"

- [x] **P-007 — Tela do calendário**
  - nível: padrao
  - repo: portal · superfícies: ui
  - arquivos: `apps/web/src/features/calendario/`
  - aceite: semana com um cartão por deploy; navegar entre semanas; estados vazio, erro e carregando; no celular vira lista
  - testes: componente nos quatro estados

- [x] **P-015 — Painel: visão geral pelo contrato e layout da prévia**
  - nível: padrao
  - repo: portal · superfícies: ui
  - por quê: a visão geral (P-012) foi feita antes do contrato e consulta colunas que não existem (`eventos.criado_em`, `sincronizacao.sincronizado_em`, `eventos.tokens`); em produção mostra "Não foi possível carregar a visão geral". E o app não segue o layout da prévia do design system.
  - dados: **só** tabelas e colunas de `docs/eventos.md` (`eventos.ts/tipo/dados`, `sincronizacao.ultima_vez`, `posts`, `comandos`); a "noite" vem do `noite_resumo` mais recente e das `tarefa_metricas`
  - arquivos: `apps/painel/src/contrato.ts` (nomes de tabela e coluna permitidos, num lugar só), `apps/painel/src/features/visao-geral/`, `apps/painel/src/App.tsx` (casca do app)
  - layout: igual a `docs/design-system/capturas/painel-escuro.png` e `docs/design-system/previa.html` — barra lateral (`.app`, `.nav-item`) com Visão geral e Performance; cabeçalho com o título da noite e o botão "Pausar agente" (`.botao-perigo`); linha da noite (`.noite`); 4 números (`.painel.numero` em `.grade-4`); tabela de tarefas (`.tabela`); "Próximo post" com "Cancelar post" (grava `cancelar_post` em `comandos`); "Precisa de você"; no celular a barra vira `.barra`. Itens da prévia de fases futuras (Vagas, Loja, Currículo) ficam de fora.
  - responsivo (relato do dono: botões feios e "Pausar agente"/"Sair" saindo da tela): botões só com as classes do design system (`.botao` + variante, altura de controle dos tokens), cabeçalho que quebra linha em vez de vazar; **nada passa da largura da tela em 360 px, 768 px e 1280 px**
  - aceite: depois do login, a visão geral carrega com os dados reais do Supabase (sem erro), mostra "última sincronização: há X min", e o layout segue a prévia nos dois temas; estados vazio, erro com "Tentar de novo" e carregando
  - testes: **teste de contrato** — o cliente falso recusa (lança erro) qualquer tabela ou coluna fora de `contrato.ts`, e `contrato.ts` bate com `docs/eventos.md`; componente com uma noite real (`noite_resumo` + `tarefa_metricas`) e com noite vazia; "Cancelar post" grava o comando certo

- [x] **P-016 — Login centralizado (painel e web)**
  - nível: barato
  - repo: portal · superfícies: ui
  - pedido do dono: o login vira um cartão central, no estilo de modal
  - arquivos: `apps/painel/src/App.tsx` (tela de entrada), `apps/web/src/features/auth/` (tela de entrada do web); estilo só com tokens e componentes de `docs/design-system/`
  - layout: a tela de entrada ocupa a altura toda, com o fundo do tema; no centro (horizontal e vertical) um cartão (`.painel`) de largura máxima ~400 px com a marca "Madrugada", o título "Entrar", os campos (`.campo`), a mensagem de erro e o botão primário de largura total; no celular o cartão ocupa a largura com o vão lateral dos tokens
  - aceite: nos dois apps, sem sessão, aparece só o cartão central (sem a barra lateral); nada vaza da tela em 360, 768 e 1280 px; temas claro e escuro; Enter envia; foco inicial no e-mail
  - testes: componente — sem sessão renderiza o cartão de entrada e não a navegação; foco inicial no campo de e-mail; erro de login aparece dentro do cartão

- [x] **P-017 — Painel: trocar o perfil de modelos**
  - nível: barato
  - repo: portal · superfícies: ui
  - pedido do dono: trocar de plano (assinatura, grátis, barato, qualidade) sem abrir o terminal
  - dados: `sincronizacao.perfil_ativo` e `sincronizacao.perfis_disponiveis` (ver `docs/eventos.md`); a troca grava `comandos` com `comando = trocar_perfil` e `args = {"perfil": "<nome>"}`
  - arquivos: `apps/painel/src/features/perfil/`, e o seletor no cabeçalho do App (ao lado de "Pausar agente")
  - aceite: o painel mostra o perfil ativo (`.selo`); um seletor lista os perfis disponíveis; escolher outro pede confirmação ("O agente passa a usar o perfil X a partir da próxima tarefa") e grava o comando; depois da próxima sincronização, o perfil exibido muda; estados carregando e erro
  - testes: componente — mostra o perfil ativo; troca grava o comando certo; cancelar a confirmação não grava nada

- [x] **P-018 — Painel: acabamento fiel à prévia**
  - nível: barato
  - repo: portal · superfícies: ui
  - por quê: comparação por captura de tela (20/11) entre o painel publicado e `docs/design-system/capturas/painel-escuro.png`
  - arquivos: `apps/painel/src/App.tsx`, `apps/painel/src/features/visao-geral/`
  - aceite (cada linha é uma diferença medida):
    - a barra lateral (`.app`) ocupa a altura toda da janela, mesmo com a página rolando
    - 1º cartão: "PRs com merge" = eventos `tarefa_mergeada` da noite (não "PRs abertas")
    - "Gasto no mês" em **R$** (soma de `custo_usd` das `tarefa_metricas` × câmbio fixo 5,40; R$ 0 no perfil assinatura), nunca em tokens
    - "Tokens na noite" com unidade legível ("12 mi", "412 mil")
    - tabela "Tarefas da noite": código **e título** do item (de `tarefa_metricas.dados.item` + título via `tarefa_planejada`, ou só o código se faltar), uma linha por item (a tentativa mais recente), estado com o selo certo (`Merge feito` · `PR aberta` · `Reprovada` · `Fila de difíceis`)
    - títulos e números com a fonte e o peso do design system (a fonte já é carregada no index.html)
  - testes: componente — cartão de merge conta `tarefa_mergeada`; gasto mostra "R$"; item repetido aparece uma vez com o estado mais recente

- [x] **P-019 — Painel: acabamento da performance e da visão geral**
  - nível: barato
  - repo: portal · superfícies: ui
  - por quê: segunda comparação por captura de tela (20/11) com `docs/design-system/capturas/painel-escuro.png`
  - arquivos: `apps/painel/src/features/visao-geral/`, `apps/painel/src/features/performance/`, um formatador de números compartilhado em `apps/painel/src/formatar.ts`
  - aceite (cada linha é uma diferença medida):
    - tarefas da noite: "**P-018** Painel: acabamento…" — código em negrito seguido do título (`dados.titulo` de `tarefa_metricas`; só o código se faltar); a hora sai da coluna principal
    - subtítulo da noite coerente com os cartões ("10 PRs com merge…"), nunca "2 PRs abertas" ao lado de "10 com merge"
    - "Próximo post": texto limitado a ~5 linhas com "Ler inteiro" que expande (como na prévia); "Cancelar post" com a classe de botão do design system, não um cinza sólido
    - Performance: título da página; as abas "7 dias"/"30 dias" com `.abas` > `.aba` do design system (hoje parecem botões crus com borda branca); números no mesmo formato da visão geral ("1,4 mi", não "1.353.831"); cada número num `.painel.numero`, como na visão geral
  - testes: formatador ("1.353.831" → "1,4 mi", "760.000" → "760 mil"); tarefa com título mostra código e título; abas com `role="tab"` e `aria-selected`

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

- [x] **P-010 — Demo pública com dados fictícios**
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

