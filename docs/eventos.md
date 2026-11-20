# Contrato de eventos — agente → painel

O notebook grava eventos no Postgres local e o `painel-sync` os copia para a tabela `public.eventos`
do Supabase (upsert pelo `id`; reenviar não duplica). O painel **só lê** esta tabela, com RLS:
apenas o dono enxerga. Use apenas os tipos e campos abaixo — nada de inventar tipo novo no front.

Colunas: `id` (bigint), `ts` (timestamptz), `tipo` (text), `origem` (text), `tarefa_id` (uuid, opcional), `dados` (jsonb).

## Métricas (fonte do P-013)

| tipo | quando | `dados` |
| --- | --- | --- |
| `tarefa_metricas` | uma vez por tarefa encerrada | `item`, `titulo`, `resultado` (`pr_aberta` \| `reprovada`), `perfil`, `tentativas`, `requisicoes`, `tokens_entrada`, `tokens_saida`, `segundos_modelo`, `custo_usd`, `modelos` (lista) |
| `noite_resumo` | fim de cada noite | `prs`, `reprovadas`, `fila_dificeis` (**tamanho atual** da fila, não do período), `fallbacks`, `quedas`, `minutos_fora`, `perfil`, `requisicoes`, `tokens_entrada`, `tokens_saida` |
| `fallback_acionado` | troca automática de perfil | `de`, `para`, `modelo` |
| `tarefa_mergeada` | PR do agente entrou na main | `item`, `pr` |

Como calcular, no período escolhido:

- **PRs por noite:** soma de `noite_resumo.prs` ÷ número de `noite_resumo`.
- **Taxa de aprovação nos portões:** `tarefa_metricas` com `resultado = pr_aberta` ÷ total de `tarefa_metricas`.
- **Tokens por tarefa:** média de `tokens_entrada + tokens_saida` em `tarefa_metricas`.
- **Fila de difíceis:** o valor do `noite_resumo` **mais recente** (é um estado, não uma contagem do período).
- **Acionamentos do fallback:** contagem de `fallback_acionado`.

## Outros tipos que o painel pode mostrar

| tipo | `dados` |
| --- | --- |
| `noite_iniciada` / `noite_encerrada` | `perfil` |
| `tarefa_planejada` | `item`, `estado`, `titulo` (opcional; o painel mostra só o código se faltar) |
| `tarefa_estado` | `estado` |
| `tarefa_concluida` | `item` |
| `portao_reprovado` | `motivo` |
| `pr_aberta` | `url`, `repo` |
| `internet_caiu` / `internet_voltou` | — / `minutos_fora` |
| `post_agendado` / `post_publicado` / `post_cancelado` / `post_ensaio` | `post` |
| `comando_painel` | `comando`, `estado` |
| `comite_aprovou` / `comite_sem_plano` | `item`, `partes`, `ciclos` |
| `infra_falhou` | `etapa`, `erro` |

Além de `eventos`, o painel usa estas tabelas (colunas **exatas** — não há outras):

| Tabela | Colunas | Painel pode |
| --- | --- | --- |
| `public.sincronizacao` | `id` (sempre 1), `ultima_vez`, `perfil_ativo`, `perfis_disponiveis` (lista de texto) | ler |
| `public.posts` | `id`, `criado_em`, `texto`, `formato`, `autor`, `estado` (`agendado` · `publicado` · `cancelado` · `ensaio` · `falhou`), `publicar_em`, `publicado_em` | ler |
| `public.comandos` | `id`, `ts`, `comando` (`pausar` · `retomar` · `trocar_perfil` · `cancelar_post` · …), `args` (jsonb), `estado` (`pendente` · `executado` · `recusado`), `executado_em` | ler e inserir (`comando`, `args`) |

O "próximo post" é o `posts` com `estado = agendado` e o menor `publicar_em`.

## Regras para o front

- Consultas com período sempre filtram por `ts` **e** têm limite explícito; se o período puder
  passar de 1000 linhas, paginar ou agregar (o PostgREST corta em silêncio).
- Campo numérico ausente ou `null` é ignorado na média (não conta como 0).
- Datas exibidas no fuso `America/Sao_Paulo`.
