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

## Contrato da API (P-004)

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| `GET /api/me` | Bearer | `{ usuarioId, email, workspaces: [{ id, nome, papel }] }` — no primeiro acesso cria o workspace pessoal | 401 |
| `POST /api/workspaces` | Bearer, `{ nome }` | `{ id, nome, papel: "dono" }` (201) | 400 (nome vazio/longo), 401 |
| `GET /api/workspaces/{id}` | Bearer | `{ id, nome, papel }` | 401, 404 (não existe **ou** não é membro) |

Qualquer rota de negócio futura (deploys, PRs) exige Bearer **e** `X-Workspace-Id`.
