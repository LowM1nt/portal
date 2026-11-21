# Decisões do portal

Registro curto das decisões que o roadmap pressupõe. O agente e o comitê leem este arquivo antes
de planejar: **não reabrir uma decisão daqui sem um item novo no roadmap.**

## D-001 — Autenticação e workspaces (P-004) · 20/11/2026

Decididas pelo dono:

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Autenticação | **Supabase Auth.** O web usa `@supabase/supabase-js` (como o painel); a API .NET só **valida** o JWT do Supabase (JWKS do projeto, `aud = authenticated`). A API não guarda senha nem emite token. | Um login só, refresh de token pronto no SDK, menos superfície de segurança |
| Usuário × workspace | **N:N**, tabela `workspace_membros (workspace_id, usuario_id, papel)`. O front guarda o workspace ativo e envia o cabeçalho `X-Workspace-Id` em toda chamada. | Uma pessoa pode estar em vários times |
| Primeiro login | **Cria um workspace pessoal** ("Meu workspace") e o usuário vira `dono`. Convite é item futuro. | Entrar e já usar |
| Recurso de outro workspace | **404 Not Found** (nunca 403). | Não revela que o id existe |

Decididas na implementação (técnicas):

- O `usuario_id` é o `sub` do JWT do Supabase (uuid). A API não espelha a tabela de usuários.
- `UsuarioAtual` e `WorkspaceAtual` são **scoped por requisição** (nunca singleton).
- Sem token ou token inválido → **401**. `X-Workspace-Id` ausente → **400**. Workspace do cabeçalho do qual o usuário não é membro → **404**.
- Toda entidade de negócio tem `WorkspaceId`; o filtro vem de um **query filter global do EF Core** baseado no `WorkspaceAtual`, e o teste prova que dois workspaces não se enxergam.
- Migrations do EF Core: aplicadas no startup **só em Development**; em produção, `dotnet ef database update` à mão.
- CORS da API: só a origem do web (`http://localhost:5173` em dev; a do deploy em produção, por configuração).
- Token no front: o SDK do Supabase cuida (armazenamento e refresh); a API recebe `Authorization: Bearer`.

## D-002 — Testes de integração com banco · 20/11/2026

- Testes que precisam de Postgres usam **Testcontainers** (`Testcontainers.PostgreSql`, imagem
  `postgres:16-alpine`): cada execução sobe um banco descartável no Docker. Funciona igual no
  notebook e no GitHub Actions (runner `ubuntu-latest` tem Docker).
- **Nunca** apontar teste para `127.0.0.1:5432`: nesse endereço roda o banco do agente, não o do portal.
- Testes sem banco (validação de JWT, 401/404, CORS) usam o provider em memória do EF Core ou
  `WebApplicationFactory` com o banco do Testcontainers — o que for mais simples para o caso.
- Tokens de teste: assinados com uma chave simétrica de teste configurada só no ambiente `Testing`;
  `notBefore` sempre **antes** de `expires` (token expirado = `notBefore` e `expires` no passado).

## Contrato da API (P-004)

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/me` | Bearer | `{ usuarioId, email, workspaces: [{ id, nome, papel }] }` — no primeiro acesso cria o workspace pessoal | 401 |
| `POST /api/workspaces` | Bearer, `{ nome }` | `{ id, nome, papel: "dono" }` (201) | 400 (nome vazio/longo), 401 |
| `GET /api/workspaces/{id}` | Bearer | `{ id, nome, papel }` | 401, 404 (não existe **ou** não é membro) |

Qualquer rota de negócio futura (deploys, PRs) exige Bearer **e** `X-Workspace-Id`.

## D-003 — Demos públicas e dependências · 20/11/2026

Decididas pelo dono:

- **Demos na nuvem grátis** (pendência P4): front no Cloudflare Pages; API .NET num free tier com
  Docker (escolher no P-010 entre os que estiverem grátis na hora, ex.: Render ou Koyeb); banco
  num projeto Supabase separado do painel, só com dados fictícios. A demo fica no ar com o notebook desligado.
- **TypeScript 7 fica de fora por enquanto:** o Dependabot ignora majors do TypeScript; a migração vira
  item do roadmap quando o ecossistema (ESLint, Vite) acompanhar.

## D-004 — Integração com GitHub (P-008) · 20/11/2026

Decididas pelo dono:

- **Acesso por token fine-grained por workspace.** O time cola um token **só de leitura** (Metadata, Pull requests, Commit statuses/Checks: read) nas configurações do workspace. Sem GitHub App e sem OAuth por enquanto.
- **Atualização a cada 10 minutos** (polling).

Decididas na implementação (técnicas):

- O token é guardado **criptografado** (ASP.NET Core Data Protection); nunca volta para o front nem aparece em log. A tela mostra só "configurado em DD/MM" e os 4 últimos caracteres.
- Um `BackgroundService` percorre os workspaces com token a cada 10 min; importa as PRs abertas dos repositórios cadastrados e o status de CI do último commit de cada uma.
- Respeita o limite da API: lê `X-RateLimit-Remaining`/`Reset` e para o ciclo antes de zerar; usa `ETag` (requisição condicional) para não gastar cota com o que não mudou.
- **Falha do GitHub nunca derruba o portal:** o erro fica registrado no workspace ("última sincronização com o GitHub: falhou às HH:MM — token expirado") e a tela mostra os últimos dados bons.
- Testes de contrato com **respostas gravadas** da API do GitHub (HttpMessageHandler falso); nenhum teste chama o GitHub de verdade.

Contrato da API:

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `PUT /api/integracoes/github` | Bearer, `X-Workspace-Id`, `{ token, repositorios: ["dono/repo"] }` | `{ configurado: true, finalToken: "abcd", repositorios }` | 400 (token vazio, repo mal formado), 401, 404 |
| `GET /api/integracoes/github` | Bearer, `X-Workspace-Id` | `{ configurado, finalToken, repositorios, ultimaSincronizacao, ultimoErro }` | 401, 404 |
| `DELETE /api/integracoes/github` | Bearer, `X-Workspace-Id` | 204 | 401, 404 |

## D-005 — "Aguardando revisão" (P-009) · 20/11/2026 · aprovada pelo dono

- **Aguardando revisão** = PR **aberta**, **não rascunho** e com **pelo menos um revisor solicitado ainda pendente** (o `requested_reviewers` da listagem do GitHub; quem já revisou sai dessa lista). É o "Review requested" do próprio GitHub.
- Vem inteira da listagem que o portal já busca: **nenhuma chamada extra** à API do GitHub.
- "Por quem revisa" = os logins em `requested_reviewers` (equipes em `requested_teams` aparecem com o nome da equipe).

Contrato:

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/revisoes?repositorio=dono/repo&revisor=login` | Bearer, `X-Workspace-Id` (filtros opcionais) | `[{ numero, titulo, autor, url, repositorio, revisores: ["login"], statusCi, atualizadaEm }]`, mais antigas primeiro | 401, 404 |


## D-006 — Bot de bugs: Discord primeiro · 20/11/2026 · decidida pelo dono

- O bot de bugs começa **só no Discord** (um canal configurado por workspace vira bugs "a triar").
- A integração fica atrás de uma interface (`ICanalDeBugs`) para o Slack entrar depois sem refazer nada.

## D-007 — Quem paga a IA que lê o relato · 20/11/2026 · decidida pelo dono

- **A chave é do próprio workspace** (o time configura a sua). O dono do Releasy não paga IA de cliente.
- **Opção gratuita guiada:** a tela de integrações oferece "Usar uma chave gratuita" com **passo a passo** para gerar uma chave grátis do Google Gemini (com aviso dos limites do plano grátis).
- Sem chave, o bug entra **sem extração** (só o relato original); nunca falha.
- A chave é guardada **criptografada** (Data Protection), nunca volta ao front nem aparece em log, como o token do GitHub (D-004).

## D-008 — Login do CRM com Auth.js · 20/11/2026 · decidida pelo dono

- O CRM ("fechou.") usa **Auth.js** (Next.js), stack diferente do Releasy de propósito (repertório no portfólio).
- Sem senha guardada em texto: e-mail mágico e/ou GitHub/Google; sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`.

## D-009 — CRM com um usuário por conta · 20/11/2026 · decidida pelo dono

- O MVP do CRM é **para um freelancer por conta**; equipes ficam para a fase 3.
- Mesmo assim, toda tabela tem `contaId` e toda consulta filtra por ele (isolamento entre contas, com teste).

## D-010 — Fórmula das métricas de entrega · 21/11/2026 · decidida na implementação

Só com o que o modelo já tem (tabelas `deploys`, `pull_requests`, `itens_roadmap`); nada de dado inventado.

- **Deploy acontecido** = deploy com status `concluido` (deu certo) ou `falhou`. O instante do deploy é o
  `agendado_para` (o modelo não tem hora de término). `agendado` e `cancelado` nunca contam.
- **Período**: os últimos `semanas × 7` dias até agora (`semanas` = 4 ou 12, padrão 12). O **período anterior** é a
  janela de mesma duração logo antes. Séries: uma linha por janela de 7 dias, da mais antiga para a mais nova.
- **Frequência de deploy** = deploys `concluido` no período ÷ dias do período (2 casas). Sem deploy é **0** (contagem real).
- **Tempo até o deploy (lead time)**, por deploy `concluido`: `agendado_para` − início, em horas. O início é o `criado_em`
  da **PR mais antiga ligada** ao deploy por um item do roadmap (`itens_roadmap.deploy_id` + `pull_request_id`); sem PR
  ligada, é o `criado_em` do próprio deploy. Valor do período = **mediana** (2 casas). Amostra negativa (deploy registrado
  depois de acontecer) fica de fora. Atenção: `pull_requests.criado_em` é quando a PR entrou no portal (1ª importação), não
  a criação no GitHub.
- **Taxa de falha** = `falhou` ÷ (`concluido` + `falhou`) no período, em % (1 casa). Sem deploy acontecido → nulo.
- **Tempo para recuperar**, por repositório e em ordem de tempo: a primeira falha abre um incidente; falhas seguidas são o
  mesmo incidente; o próximo `concluido` do mesmo repositório o fecha. Amostra = fechamento − primeira falha, em horas,
  contada no período da primeira falha. Incidente ainda aberto não vira amostra. Valor = **mediana** (2 casas).
- **Variação** = (atual − anterior) ÷ anterior × 100, em % (1 casa); **nula** se um dos dois for nulo ou o anterior for 0.
- Sem amostra, lead time, taxa e recuperação vêm **nulos** (nunca 0).
- Ainda não existe endpoint que marque um deploy como `concluido`/`falhou`: até isso entrar (manual ou via integração),
  só dados semeados aparecem nas métricas.

Contrato:

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/metricas?semanas=4\|12` | Bearer, `X-Workspace-Id` | `{ semanas, inicio, fim, deploysPorDia, tempoAteDeployHoras, taxaDeFalha, tempoParaRecuperarHoras, series: [{ inicio, fim, deploys, falhas, taxaDeFalha, tempoAteDeployHoras, tempoParaRecuperarHoras }] }`; cada métrica é `{ valor, anterior, variacao }` | 400 (`semanas` fora de 4/12), 401, 404 |

## D-011 — Membros, convites e papel admin · 21/11/2026 · decidida na implementação

- Papéis: `dono`, `admin`, `membro`. **Admin, por enquanto, tem os mesmos poderes de membro**: integrações (GitHub),
  convites e gestão de membros continuam **só do dono**. Afrouxar isso exige item novo no roadmap.
- **Convite**: token aleatório de 32 bytes (`RandomNumberGenerator`, Base64Url); o banco guarda **só o SHA-256** do token.
  Validade de 7 dias. O link (`{Web:Url ou Cors:Origem}/convite#token=…`, token no fragmento para não ir a log de servidor)
  é devolvido **uma única vez**, na criação. Convite só dá papel `membro` ou `admin` (dono, só promovendo depois).
- Até **50 convites pendentes** (não usados e não expirados) por workspace; o rate limit global vale para tudo.
- **Aceite**: exige login; confere hash, validade, não usado e e-mail do convite == e-mail do JWT (sem diferenciar
  maiúsculas). Uso único à prova de corrida: `UPDATE … WHERE usado_em IS NULL` dentro da transação que cria o vínculo.
  Token inexistente, malformado, expirado, já usado ou de outro e-mail → **a mesma mensagem** (400). Quem já é membro → 409
  (o convite não é gasto).
- **Regras de membros**: o dono não remove a si mesmo (400) e ninguém rebaixa o último dono (409). Mudanças de membros e
  convites do mesmo workspace são serializadas com `SELECT … FOR UPDATE` na linha do workspace. Membro de outro workspace → 404.
- `workspace_membros.email` guarda o e-mail do JWT de quem criou o workspace ou aceitou o convite (só para exibir; nulo
  em vínculos antigos).
- Sem provedor de e-mail: `IEnviadorDeEmail` tem implementação nula; o dono copia o link.

Contrato:

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/workspace/membros` | Bearer, `X-Workspace-Id` | `[{ usuarioId, email, papel, voce }]` (donos, admins, membros) | 400, 401, 404 |
| `POST /api/workspace/convites` | Bearer, `X-Workspace-Id`, `{ email, papel: "membro"\|"admin" }` (só dono) | 201 `{ id, email, papel, expiraEm, link }` | 400 (e-mail/papel inválido, 50 pendentes), 401, 403, 404, 409 (já é membro) |
| `POST /api/convites/aceitar` | Bearer, `{ token }` | `{ workspaceId, nome, papel }` | 400 (mensagem neutra), 401, 409 (já é membro) |
| `PATCH /api/workspace/membros/{usuarioId}` | Bearer, `X-Workspace-Id`, `{ papel: "dono"\|"admin"\|"membro" }` (só dono) | `{ usuarioId, email, papel, voce }` | 400, 401, 403, 404, 409 (último dono) |
| `DELETE /api/workspace/membros/{usuarioId}` | Bearer, `X-Workspace-Id` (só dono) | 204 | 400 (a si mesmo), 401, 403, 404 |

## D-012 — Lote B: status do deploy, convites pendentes e login do GitHub · 21/11/2026 · decidida na implementação

- **Status do deploy**: qualquer membro do workspace marca `concluido` ou `falhou` (e volta para `agendado` se marcou por
  engano). Deploy `cancelado` não muda mais (409). Com isso as métricas (D-010) passam a ter dados reais.
- **Repositórios do formulário**: `GET /api/repositorios` lista os do workspace. Salvar a configuração do GitHub já cria os
  registros dos repositórios (mesmo nome que o importador usa), para dar para marcar deploy antes da 1ª sincronização.
  Tirar um repositório da lista **não** apaga o registro (os deploys dele continuam).
- **GitHub sem token novo**: `PUT /api/integracoes/github` sem `token`, com o GitHub já configurado, troca só a lista de
  repositórios (o token guardado e a data de configuração continuam). Sem configuração, o token segue obrigatório (400).
  A resposta passa a trazer `configuradoEm` (a tela mostra "configurado em DD/MM/AAAA · final ••••abcd").
- **Convites pendentes**: listar e revogar são só do dono. A lista **nunca** traz token, hash nem link. Revogar apaga o
  convite: o link deixa de achar o hash e cai na mesma mensagem neutra de convite inválido (D-011). Convite já usado ou de
  outro workspace → 404.
- **Login do GitHub**: é da **pessoa** (não do workspace): tabela `perfis_usuario (usuario_id, github_login)`, com RLS,
  sempre lida e escrita pelo `sub` do JWT. Formato do GitHub: 1 a 39 letras, números ou hífens, sem hífen no começo, no fim
  ou dois seguidos; `@` na frente é ignorado; vazio apaga. O web usa o login para "Esperando você" (Início, fila e contador),
  comparando sem diferenciar maiúsculas; sem login, mostra a fila do time com uma dica para configurar.
- **Convite no web**: o link `/convite#token=…` é lido do fragmento, guardado só na aba (sessionStorage) e o endereço é
  limpo na hora. Logado, aceita uma vez e entra no workspace; sem login, as telas de entrar/criar conta avisam do convite e
  ele é aceito logo depois do login. O token nunca vai em query string nem em log.
- **Duas etapas (MFA TOTP)**: pelo SDK do Supabase (`mfa.enroll/challengeAndVerify/unenroll`). O QR code é a imagem SVG em
  data URI que o próprio SDK devolve (só é desenhada se começar com `data:image/svg+xml`); a CSP já tinha `img-src 'self'
  data:`, então nada mudou nela. Desligar pede o código antes (sessão aal2). Com fator verificado e sessão aal1, o web pede
  o código depois da senha. A API passou a exigir `aal2` de quem ligou: ver D-013.

Contrato (novos):

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `PATCH /api/deploys/{id}/status` | Bearer, `X-Workspace-Id`, `{ status: "concluido"\|"falhou"\|"agendado" }` | o deploy | 400 (status inválido), 401, 404, 409 (cancelado) |
| `GET /api/repositorios` | Bearer, `X-Workspace-Id` | `[{ id, nome }]` em ordem de nome | 400, 401, 404 |
| `GET /api/workspace/convites` | Bearer, `X-Workspace-Id` (só dono) | `[{ id, email, papel, criadoEm, expiraEm }]` (pendentes) | 400, 401, 403, 404 |
| `DELETE /api/workspace/convites/{id}` | Bearer, `X-Workspace-Id` (só dono) | 204 | 400, 401, 403, 404 (não existe, já usado ou de outro workspace) |
| `PUT /api/me/github` | Bearer, `{ login }` (vazio apaga) | `{ githubLogin }` | 400 (formato), 401 |
| `GET /api/me` | Bearer | passa a trazer `githubLogin` (ou null) | 401 |

## D-013 — A API exige as duas etapas de quem ligou · 21/11/2026 · decidida na implementação

Fecha o limite da D-012: antes, só a tela do web pedia o código; com a senha roubada dava para chamar a API direto com um
token `aal1`.

- **Estado**: coluna `perfis_usuario.mfa_exigido` (bool, padrão `false`; a tabela já tem RLS). Só a própria pessoa muda,
  sempre pelo `sub` do JWT.
- **Regra**: em toda rota que exige login (presente ou futura), se `mfa_exigido = true` e o JWT não traz `aal = "aal2"`
  (inclusive sem a claim) → **403** `{ "erro": "Confirme o código de duas etapas pra continuar.", "codigo": "mfa_necessario" }`.
  É um middleware logo depois de `UseAuthorization` (vale para rotas novas sem precisar lembrar de marcar), e não toca rota
  anônima (`/health`, demo).
- **Exceção única**: `GET /api/me` (marcada com `PermitirSemMfa()`), porque o web precisa saber o estado (`mfaExigido`)
  antes do código. Ela só lê os dados da própria pessoa (e cria o workspace pessoal se faltar).
- **Ligar/desligar**: `PUT /api/me/mfa { exigir }` só com token `aal2` (o código acabou de ser conferido); com `aal1` → 403
  `mfa_necessario`, nos dois sentidos. Não recebe id de usuário: ninguém muda o de outra pessoa.
- **Desempenho e janela**: token `aal2` não consulta nada. Para `aal1`, o valor fica num cache em memória por usuário por
  **60 s** por instância. Quem muda o próprio estado pelo `PUT` atualiza o cache da instância na hora. Mudança feita em
  outra instância ou direto no banco (recuperação, abaixo) pode levar **até 60 s** para valer numa instância que já tinha
  o valor em cache (hoje o Render roda uma instância só).
- **Web**: ligar = `enroll` → `challengeAndVerify` (sessão vira `aal2`) → `PUT {exigir:true}`; se a API falhar, a tela
  avisa e não mostra "ligada". Desligar = pede o código (`aal2`) → `PUT {exigir:false}` → só então `unenroll` (se o
  `unenroll` falhar, volta `exigir:true`). Qualquer 403 `mfa_necessario` leva para a tela do código (não desloga).
  O token do `PUT` é lido do SDK na hora, porque logo depois do verify o estado do React ainda tem o token `aal1`.
- **Quem já tinha ligado antes desta mudança** (fator verificado e `mfa_exigido = false`): ao abrir o app com sessão
  `aal2`, ou logo depois de digitar o código no login, o web chama `PUT {exigir:true}` sozinho.
- **Recuperação (perdeu o celular)**: sem endpoint público. A pessoa fala com o dono do sistema, que confirma a identidade
  por fora e:
  1. no painel do Supabase (Authentication → Users → a pessoa → Factors), remove o fator TOTP;
  2. no banco: `UPDATE perfis_usuario SET mfa_exigido = false WHERE usuario_id = '<uuid do usuário>';`
  3. avisa que pode levar até 60 s para valer (cache); depois a pessoa entra só com a senha e, se quiser, liga de novo.
- **Limites**: testado com tokens de teste que imitam a claim `aal` do Supabase, não contra um Supabase real. Quem impede
  um `aal1` de cadastrar um fator novo ou remover o verificado é o próprio Supabase (essas chamadas exigem `aal2` quando já
  existe fator verificado — comportamento do Supabase Auth, não verificado contra o projeto real).

Contrato (novos):

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `PUT /api/me/mfa` | Bearer **aal2**, `{ exigir: true\|false }` | `{ mfaExigido }` | 400 (sem `exigir`), 401, 403 `mfa_necessario` (token aal1) |
| `GET /api/me` | Bearer (aal1 ou aal2) | passa a trazer `mfaExigido` | 401 |
| qualquer rota autenticada | Bearer aal1 com `mfa_exigido` | — | 403 `{ erro, codigo: "mfa_necessario" }` |

## D-014 — Bot de bugs no Discord, extração por IA e base da triagem · 21/11/2026 · decidida na implementação

Implementa P-025 (D-006) e P-026 (D-007) na API, mais a base da tela de triagem do lote D.

**Configuração (por workspace; só o dono muda, qualquer membro lê o estado)**

- **Discord**: token do bot + ID do canal. O token é cifrado com Data Protection (propósito próprio,
  `Portal.Integracoes.Discord.Token`), nunca volta (só os 4 últimos caracteres) e nunca vai para log. Trocar o canal
  reinicia o cursor. O bot precisa estar no servidor, ter "Ver canal" e "Ler histórico de mensagens" no canal e o
  intent privilegiado **Message Content** ligado no portal de desenvolvedores do Discord (sem ele o `content` vem vazio
  e nada vira bug).
- **IA**: provedor (`gemini`; outro entra implementando `IProvedorDeIa`) + chave do workspace, cifrada do mesmo jeito
  (propósito `Portal.Integracoes.IA.Chave`). O GET diz só `configurado` e `provedor`: nem o final da chave volta.
- Os `HttpClient` do Discord e do Gemini registram cabeçalhos sempre mascarados (`RedactLoggedHeaders`); a chave do
  Gemini vai no cabeçalho `x-goog-api-key`, nunca na URL. Exceções viram log só com o tipo, nunca com a mensagem.

**Fluxo do Discord (P-025)**: `CaptacaoDoDiscord`, serviço em segundo plano (fora do ambiente Testing).

1. A cada **1 minuto**, para cada workspace com bot: `GET /api/v10/channels/{canal}/messages?after={cursor}&limit=100`
   com `Authorization: Bot ...`. O cursor começa no instante da configuração (snowflake calculado da data): o histórico
   anterior do canal **não** é importado.
2. Cada mensagem de gente (tipos 0 e 19) com texto vira bug **"a triar"**, origem `discord`, título = 1ª linha (até 120
   caracteres), relato = texto original, autor = nome visível (`global_name`, senão `username`). Bots, webhooks,
   mensagens de sistema e mensagens sem texto (só anexo) são ignorados, mas contam para o cursor.
3. **Deduplicação**: índice único `(workspace_id, mensagem_externa_id)` em `bugs` + checagem antes de inserir; bugs e
   cursor gravam na mesma transação. A mesma mensagem nunca vira dois bugs (nem relendo do zero).
4. Até **5 páginas** por workspace por ciclo; o resto fica para o próximo.
5. **Rate limit**: 429 → respeita o `Retry-After` (cabeçalho ou `retry_after` do corpo; teto de 1 h) e não chama o
   Discord desse workspace antes disso. Balde zerado (`X-RateLimit-Remaining: 0`) → para a paginação e espera o
   `X-RateLimit-Reset-After`. A espera fica em memória (um reinício zera; o Discord responde 429 de novo se preciso).
6. **Falha nunca derruba a API**: 401/403 → "Token do bot inválido ou sem acesso ao canal."; 404 → "Canal do Discord
   não encontrado."; 5xx, rede, timeout (20 s) ou corpo ilegível → "Não foi possível ler o canal do Discord." O erro
   fica em `configuracoes_discord.ultimo_erro` (aparece no GET) e some na próxima leitura boa. Um workspace com erro
   não atrapalha os outros.

**Fluxo da IA (P-026)**: `ProcessadorDeExtracao` + `ExtracaoEmSegundoPlano` (fora do ambiente Testing).

1. Ao criar um bug (manual ou Discord), se o workspace tem chave, ele entra na fila (`sugestoes_ia`, status
   `pendente`) na mesma transação. **Sem chave, nada entra na fila e a IA nunca é chamada**: o bug fica só com o relato.
2. A cada **15 s**, até 10 pendentes por ciclo: monta o pedido, chama o provedor com a chave do próprio workspace e
   grava o resultado. Se a chave foi apagada antes, a sugestão vira `cancelada` sem chamada nenhuma.
3. **Limites**: só os primeiros **4.000 caracteres** do relato (e 200 do título) vão para a IA; saída limitada a
   **1.024 tokens** (`maxOutputTokens`); resposta acima de 8.000 caracteres é rejeitada sem interpretar; o corpo HTTP
   lido tem teto de 256 KB; **timeout de 30 s** por chamada.
4. **Retentativas**: só para falha temporária (429, 5xx, timeout, rede): até **3 tentativas**, esperando 1 min e depois
   2 min. Chave recusada (401/403 ou `API_KEY_INVALID`), pedido recusado e resposta fora do formato **não** são
   retentados. Tudo que falha vira `falhou` com uma mensagem curta, e o bug segue normal.
5. **Saída validada por schema**: objeto com exatamente as chaves `passos`, `esperado`, `obtido`, `ambiente`,
   `severidade` (`baixa|media|alta|critica`), `area`, `confianca` (inteiro 0–100) e `evidencias` (até 3 trechos de até
   200 caracteres), com teto de tamanho em cada texto. O schema também vai no pedido (`responseSchema`, saída
   `application/json`), mas a validação é sempre do nosso lado. Qualquer desvio (chave a mais ou a menos, tipo errado,
   enum fora, JSON quebrado, texto livre) **rejeita a resposta inteira**: nada é aproveitado.
6. **A sugestão fica separada do bug**: `sugestoes_ia` guarda o que a IA disse; os campos do bug (`passos`,
   `severidade`...) continuam sendo o que o humano escreveu ou confirmou na triagem.

**Prompt injection**

- O relato vai como **dado**: na mensagem do usuário, entre marcadores com um nonce aleatório por chamada
  (`<<<RELATO_ab12...>>>` … `<<<FIM_RELATO_ab12...>>>`). `<<<`/`>>>` dentro do relato viram `‹‹‹`/`›››`, então o relato
  não consegue "fechar" o bloco.
- A instrução de sistema diz que tudo entre os marcadores é dado não confiável e que ordens ali (ignorar regras, mudar o
  formato, revelar instruções, fingir ser o sistema) não devem ser obedecidas.
- A defesa que vale mesmo é a validação: ainda que o modelo obedeça ao relato, a resposta só entra se bater exatamente
  com o schema, e o que entra é texto curto e uma severidade de um enum, mostrados como sugestão para um humano aprovar.
  A resposta nunca vira comando, nunca muda status sozinha e nunca é executada.

**Triagem (base da tela do lote D)**: qualquer membro do workspace.

- `GET /api/triagem`: até 100 bugs "a triar" (mais novos primeiro) com a sugestão (se houver) e o **possível
  duplicado**: o bug mais parecido do mesmo workspace (entre os 500 mais recentes, fora os descartados) por similaridade
  de palavras (Jaccard sem acento nem caixa, ignorando palavras curtas e comuns; 60% título + 40% título e primeiros
  1.000 caracteres do relato), se a nota for ≥ 50. Sem embeddings.
- `POST /api/triagem/{bugId}`: `aprovar` (exige sugestão `pronta`; aplica a severidade sugerida, move para
  `em_andamento`, sugestão `aprovada`), `ajustar` (severidade escolhida, move para `em_andamento`; sugestão pronta vira
  `ajustada`; funciona sem sugestão) ou `descartar` (sugestão `pronta`/`falhou` vira `descartada`; o bug continua "a
  triar"). Bug que já não está "a triar" → 409.

**Dados** (migration `BotDiscordEExtracaoIa`, RLS ligado nas tabelas novas): `bugs.autor`, `bugs.mensagem_externa_id`
(+ índice único parcial); `configuracoes_discord`; `configuracoes_ia`; `sugestoes_ia` (uma por bug, FK com cascade).
`GET /api/bugs` passa a trazer `autor` (ou null).

**Limites conhecidos**: testado só com respostas gravadas (HttpMessageHandler falso), nunca contra o Discord ou o Gemini
reais. A fila da IA assume uma instância (o Render hoje roda uma): com várias, duas poderiam processar a mesma pendente
(mesmo resultado, chamada dobrada). Modelo padrão `gemini-2.5-flash`, configurável em `Ia:Gemini:Modelo`.

Contrato da API:

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/integracoes/discord` | Bearer, `X-Workspace-Id` | `{ configurado, finalToken, canalId, ultimaLeitura, ultimoErro, configuradoEm }` | 401, 404 |
| `PUT /api/integracoes/discord` | idem (só dono), `{ token?, canalId }` (sem token = mantém o atual) | igual ao GET | 400, 401, 403, 404 |
| `DELETE /api/integracoes/discord` | idem (só dono) | 204 | 401, 403, 404 |
| `GET /api/integracoes/ia` | Bearer, `X-Workspace-Id` | `{ configurado, provedor }` | 401, 404 |
| `PUT /api/integracoes/ia` | idem (só dono), `{ provedor: "gemini", chave? }` (sem chave = mantém a atual) | `{ configurado, provedor }` | 400, 401, 403, 404 |
| `DELETE /api/integracoes/ia` | idem (só dono) | 204 | 401, 403, 404 |
| `GET /api/triagem` | Bearer, `X-Workspace-Id` | `[{ bugId, titulo, relato, origem, autor, severidade, criadoEm, sugestao, possivelDuplicado }]`; `sugestao` = `{ status, severidade, area, passos, esperado, obtido, ambiente, confianca, evidencias, erro }` ou null; `possivelDuplicado` = `{ bugId, titulo, similaridade }` ou null | 401, 404 |
| `POST /api/triagem/{bugId}` | idem, `{ acao: "aprovar"\|"ajustar"\|"descartar", severidade? }` | `{ bug, sugestao }` | 400 (ação/severidade), 401, 404 (inexistente ou de outro workspace), 409 (já triado; sem sugestão para aprovar/descartar) |

Status da sugestão: `pendente`, `pronta`, `falhou`, `cancelada`, `aprovada`, `ajustada`, `descartada`. Todas as rotas
novas passam pelo filtro de duas etapas (D-013).
