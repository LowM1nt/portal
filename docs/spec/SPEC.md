# SPEC — <nome da feature>

## Mapa de reuso

O que já existe e será reusado, e qual feature existente serve de modelo.

| Preciso de | Já existe? | Decisão (reusar, estender ou criar) | Por quê |
| --- | --- | --- | --- |
| | | | |

## Contrato da API

Definir **antes** de codar qualquer lado.

| Método e rota | Entrada | Saída | Erros |
| --- | --- | --- | --- |
| | | | |

## Dados

- **Reuso:** colunas e índices existentes que serão usados.
- **Novo:** o que será criado, e o índice que mantém a consulta limitada.
- **Migration:** só se o delta acima exigir.

## Regras e invariantes

- Toda consulta e toda escrita filtram pelo dono dos dados.
-

## Tela

Componentes do design system usados e o que cada estado mostra (vazio, carregando, erro).

## Casos de borda

| Caso | O que acontece |
| --- | --- |
| Dois usuários ao mesmo tempo | |
| Id de outro dono | |
| Sem internet no meio | |

## Fora do escopo

-
