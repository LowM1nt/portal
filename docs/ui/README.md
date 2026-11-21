# Padrão visual do Releasy

> **Regra de ouro:** nenhuma tela é feita, alterada ou mergeada sem seguir este guia.
> Decidido pelo dono em 20/11/2026, em 5 rodadas de escolha (as maquetes estão em `referencias/`).
> Substitui o antigo "Madrugada" (`docs/design-system/`), que fica só como histórico.

**Em uma frase:** escuro roxo moderno e minimalista, conteúdo centralizado, navegação rápida por um dock flutuante, nada torto, texto descontraído.

## 1. Personalidade

- **Moderno, tecnológico e minimalista.** Só o essencial na tela; muito respiro, mas sem desperdiçar espaço (densidade equilibrada).
- **Profissional.** Tudo alinhado na mesma grade, tamanhos repetidos, nenhum elemento "quase" alinhado.
- **Fácil de usar.** Cada tela tem **uma** ação principal. O caminho mais comum é sempre o mais curto.

## 2. Marca

- Nome: **Releasy** (release + easy). Nos textos: "Releasy", com R maiúsculo.
- Logo: **`releasy.`** — só tipografia, minúsculas, Inter peso 800, aperto `-0.045em`, com um **ponto redondo roxo** (`--roxo`, 0,2 em) na linha de base. **Sem fundo, sem quadrado, sem ícone.**
- Ícone pequeno (favicon, topo do dock, app): **`r.`** com o mesmo ponto.
- No claro, as letras ficam `#1a1225`; o ponto continua roxo.

## 3. Cores e brilho

Tokens em `tokens.css` (nunca usar cor solta no código).

- **Tema escuro "Aurora berinjela" é o padrão.** O claro existe, por escolha no menu da conta, e respeita a preferência do sistema.
- **Fundo:** `--fundo` com o **halo Aurora** (`--halo`) fixo atrás da página. O halo fica; não tirar.
- **Brilho leve nos componentes:** vidro discreto (`--superficie` + `--vidro`) em cartões, listas e dock; **aura** (`--aura`) **só** no botão primário e no item ativo. Nada de brilho extra, neon ou degradê em botão.
- **Roxo `--roxo` é a marca:** botão primário, item ativo, foco, ponto da logo, contador. Não usar roxo para decorar.
- **Cor de estado é informação:** verde = deu certo, âmbar = atenção, rosa = falhou, roxo claro = em andamento. Sempre com **ponto + palavra** (nunca só cor).
- Contraste mínimo AA (4,5:1 no texto normal). `--texto-apagado` só em legenda, nunca em texto que precisa ser lido.

## 4. Tipografia

- **Inter**, uma família só. Pesos: 500 (corpo), 600 (rótulos), 700 (destaques), 800 (títulos e números).
- Escala: display 30 · título 22 · subtítulo 16 · corpo 14 · pequeno 13 · legenda 12 · número 24.
- Títulos com aperto `-0.02em`. Números com `font-variant-numeric: tabular-nums` em tabelas.
- Texto de uma linha (título de cartão, célula, selo, botão) **não quebra**: `white-space: nowrap`; se não couber, reticências — e o texto de exemplo deve caber.

## 5. Grade, espaço e alinhamento (o que mais importa)

- **Grade de 4 px.** Espaços só dos tokens `--e1`…`--e12`.
- **Conteúdo centralizado** com largura máxima `--largura-conteudo` (1120 px) e margens laterais iguais.
- **Alturas fixas:** botão e campo 40 px (pequeno 32, grande 48); linha de tabela 52 px; selo 24 px; item do dock 40 px.
- **Cartões lado a lado têm a mesma altura** e colunas iguais (`repeat(n, minmax(0, 1fr))`), com o mesmo vão (16 px).
- Tudo que está numa linha fica **centralizado na vertical** (`align-items: center`). Legendas e rótulos de blocos vizinhos ficam na **mesma linha de base**.
- Números e datas **alinhados à direita** em tabelas; texto à esquerda.
- Ícones de 20 px no dock e 16 px em botões, **centralizados** no seu espaço.
- **Proibido:** texto quebrando em botão/selo, elemento vazando do contêiner, rolagem lateral na página, blocos da mesma linha com topos diferentes.

## 6. Navegação

### Desktop: dock flutuante (escolha B)
- Uma **pílula vertical solta da borda esquerda** (16 px), **centralizada na vertical**, largura 64 px, raio 20, `--superficie` + vidro.
- De cima para baixo: logo `r.` · destinos (só ícones) · busca (Ctrl+K) · espaço · Configurações · **avatar da conta** (abre o menu: conta, tema claro/escuro, sair).
- Item ativo: fundo `--roxo`, ícone branco, `--aura`. Hover: `--superficie-2`.
- **Nome do destino aparece numa dica** ao lado do ícone (hover ou foco do teclado).
- O conteúdo começa depois do dock e fica centralizado no espaço que sobra.

### Celular: barra no rodapé estilo WhatsApp (W1)
- Barra fixa no rodapé com **4–5 abas, ícone + nome** em todas. A ativa ganha uma **pílula `--roxo-suave` atrás do ícone** e texto em negrito.
- Abas: **Início · Deploys · Revisões · Bugs · Mais** (o "Mais" guarda o resto).
- **Arrastar para o lado troca de aba.**
- **Contador** de pendências numa bolinha roxa sobre o ícone.
- Topo: logo `releasy.` à esquerda; busca e avatar à direita.
- A ação principal vira o **botão "+" redondo flutuante**, acima da barra, à direita.
- Áreas de toque de no mínimo 44 px.

### Busca rápida (Ctrl+K) — em todo sistema
- Abre no topo central, raio 20, `--superficie-solida`, véu escurecido atrás.
- Grupos **Ações** e **Ir para**; item selecionado com `--roxo-suave`; atalhos à direita em `kbd`. Esc fecha. Setas navegam, Enter executa.

## 7. Componentes

| Componente | Regra |
| --- | --- |
| **Botão** | **Pílula** (`--raio-pilula`). Primário: `--roxo`, texto branco, `--aura`; hover sobe 1 px. Secundário: `--superficie-2` com borda. Fantasma: só texto suave. Perigo: `--erro-fundo` + texto `--erro`. Carregando: spinner + verbo no gerúndio ("Salvando…"). Desativado: 45% de opacidade, sem aura. **Um primário por área.** |
| **Campo** | **Com contorno**: fundo `--campo`, borda `--borda`, raio 12, 40 px. Rótulo em cima (600, 13 px), ajuda embaixo (`--texto-apagado`). Foco: borda `--roxo` + anel de 4 px `--roxo-suave`. Erro: borda `--erro` + mensagem dizendo **o que fazer**. |
| **Abas (segmentado)** | Pílula com fundo `--campo`; a ativa em `--roxo`. |
| **Chave / marcação** | Chave pílula roxa quando ligada; caixa de marcação raio 6 roxa com check branco. |
| **Selo** | Pílula de 24 px, **ponto + palavra**, fundo da cor de estado a ~13%. |
| **Cartão** | `--superficie`, borda, raio 16, padding 16. Número grande (800, 24 px) + legenda + variação. |
| **Tabela** | Linhas de 52 px, cabeçalho em legenda discreta, hover `rgba(155,77,255,.06)`. Vira **cartões no celular**. |
| **Modal central** | Para coisas **curtas**: confirmar, até ~5 campos. Raio 20, 360–480 px, véu escurecido + desfoque. X suave no canto superior direito. Botões à direita: fantasma "Cancelar" + ação. |
| **Painel lateral** | Para **formulários maiores e detalhes**. Desliza da direita, flutuando a 12 px das bordas, raio 20, 380–480 px. Ações no rodapé do painel. |
| **Toast (aviso)** | **Canto superior direito**, raio 16. Ícone + título + frase. **X suave no topo direito.** **Barrinha de tempo** no rodapé que se esvazia em 5 s. **Erro não some sozinho.** Exclusão traz **"Desfazer"**. |
| **Ação perigosa** | **Confirmação** (modal com ícone) **+ desfazer** (toast) por alguns segundos. |
| **Gráfico** | **Linhas suaves com área em degradê** do roxo ao transparente. Grade discreta, sem bordas. |
| **Ícones** | Linha fina arredondada (Lucide), traço 1,8–2, `currentColor`. |

## 8. Estados (toda tela tem os quatro)

1. **Carregando:** **esqueleto** no formato do conteúdo, com brilho animado roxo bem fraco. A tela não "pula" quando os dados chegam.
2. **Vazio:** **ícone num quadrado suave + frase + botão** da ação. Ex.: "Semana tranquila por aqui · Nenhum deploy marcado. Que tal agendar o primeiro?"
3. **Erro:** mesmo formato do vazio, em rosa; explica, tranquiliza e oferece "Tentar de novo".
4. **Com dados.**

## 9. Movimento

Sutil: 150–200 ms com `--curva`. Hover, abrir dock/dica, modal (aparece + leve escala), painel (desliza), toast (entra da direita). Respeita **reduzir movimento** (vira instantâneo).

## 10. Texto (microcopy)

- Tom **descontraído**, com "você", frases curtas, sem jargão desnecessário.
- Botões com **verbo**: "Criar deploy", "Tentar de novo" (não "OK", não "Enviar").
- Erro: o que aconteceu + o que fazer. Nunca culpar quem usa.
- Exemplos: "Deploy criado! Já tá no calendário de sexta." · "Ops, não deu pra salvar. Sem conexão; tenta de novo em instantes." · "Essa página tirou folga."
- Datas relativas quando perto ("Hoje, 16:00", "Amanhã, 11:00"); pt-BR com vírgula decimal ("1,8 d").

## 11. Acessibilidade

Foco sempre visível (anel roxo). Tudo operável por teclado (dock, Ctrl+K, modal com foco preso, Esc fecha). `aria-label` em botões só com ícone. Cor nunca é a única informação. Contraste AA.

## 12. Portão visual (antes de qualquer PR de tela)

1. Capturas com Playwright em **1360 px, 1024 px e 390 px**, no escuro (e no claro, se a tela mexe em cor).
2. Checagens automáticas: **sem rolagem lateral; nenhum texto vazando ou quebrando** em botão/selo/célula; **topos alinhados** em blocos da mesma linha; sem erro no console.
3. Comparar com `referencias/` e com esta lista. Qualquer item da seção 5 violado **bloqueia**.
4. **PR de tela só é mergeada com o OK do dono** nas capturas.

## Referências visuais

As maquetes aprovadas, abrir no navegador: `referencias/`.

| Arquivo | O que decide |
| --- | --- |
| `rodada-2c-aurora-berinjela.html` | Tema (V1) |
| `rodada-2-escuro-dock-fonte.html` | Dock B e Inter |
| `rodada-3-componentes.html` | Componentes (botão B = pílula, campo A = contorno) |
| `rodada-4-brilho-logo.html` | Nível de brilho (B1 leve, mantendo o halo do fundo) |
| `rodada-4c-logo-detalhe.html` | Logo D1 `releasy.` |
| `rodada-5-celular.html` | Celular W1 |
