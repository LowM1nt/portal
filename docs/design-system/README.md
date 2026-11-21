# Madrugada — meu design system pessoal
> ⚠️ **Substituído** pelo padrão visual do Releasy em [`docs/ui/`](../ui/README.md) (20/11/2026). Mantido só como histórico.

O visual de tudo o que eu construo: o painel do agente, o portal, o CRM, o portfólio e a loja.

**A ideia:** o agente trabalha de madrugada. O sistema tem a cara disso: um escuro neutro, na linha do Discord, com o roxo como marca. É moderno e leve, e o tema claro existe para quem preferir.

| Arquivo | O que é |
| --- | --- |
| `tokens.css` | Cores, tipografia, espaço, tamanhos, raio e movimento, nos dois temas |
| `components.css` | Os componentes em CSS puro, sem dependências (cerca de 13 KB com os tokens) |
| `previa.html` | A tela "Visão geral" do painel montada com o sistema. Abrir no navegador |
| `componentes.html` | A vitrine dos componentes, todos alinhados na mesma grade |
| `capturas/` | As duas telas no tema escuro, no claro e no celular |
| `tailwind-preset.js` | Opcional: as mesmas cores como classes do Tailwind |

## Princípios

1. **Noite primeiro.** O escuro é o padrão, sempre. O claro só entra por escolha de quem usa (`data-theme="light"`) e fica gravado.
2. **O roxo é a marca; cor de estado é informação.** Verde, âmbar e rosa só aparecem para dizer que algo está ok, pede atenção ou falhou. Nunca para decorar.
3. **Uma coisa memorável: a linha da noite.** A barra que mostra o que o agente fez das 01h às 05h. O resto da tela fica quieto em volta dela.
4. **Hierarquia por tom e por espaço.** Nada de sombra e nada de borda em volta de painel. Um painel se destaca por ser um tom abaixo do fundo, como os blocos do Discord; campos e hover ficam um tom acima.
7. **Pouco ruído.** Só tons de roxo e de cinza na tela. Cor de estado aparece apenas no ponto e na palavra do selo. Uma informação por linha, uma ação principal por painel.
8. **Tudo alinhado e do mesmo tamanho.** Todo controle (botão, campo, select, item de menu, linha da noite) tem 40 px de altura. Todo selo tem 24 px. Toda grade usa colunas iguais com o mesmo vão de 24 px, e painéis da mesma linha têm a mesma altura. Linhas de tabela e de lista têm 56 px. Nem tudo precisa de caixa: blocos simples se separam só pelo espaço.
5. **Leve por construção.** Uma única fonte carregada, CSS puro, nenhuma imagem decorativa, nenhum efeito pesado.
6. **A cor nunca vai sozinha.** Todo estado tem um ponto e uma palavra ("Merge feito", "Portão reprovado").

## Cores

### Tema escuro (padrão)

| Token | Valor | Uso |
| --- | --- | --- |
| `--noite` | `#313338` | Fundo da página. Cinza-escuro neutro, na linha do Discord |
| `--veu` | `#2b2d31` | Painéis e menu (um tom abaixo do fundo) |
| `--veu-alto` | `#383a40` | Hover, item selecionado, campos |
| `--linha` | `#3f4147` | Bordas e divisórias |
| `--texto` | `#f2f3f5` | Texto principal |
| `--texto-suave` | `#b5bac1` | Texto de apoio |
| `--texto-fraco` | `#8e929b` | Legendas e ajuda |
| `--roxo` | `#7a45f0` | Preenchimentos: botão primário, barras, seleção |
| `--roxo-forte` | `#8f5bff` | Hover de preenchimento e anel de foco |
| `--roxo-texto` | `#b79cff` | Links e ícones sobre o fundo escuro |
| `--roxo-veu` | `#3b3466` | Fundo tingido: item ativo do menu, selo roxo |
| `--ok` / `--ok-veu` | `#4ade9a` / `#233b30` | Deu certo |
| `--atencao` / `--atencao-veu` | `#ffb85c` / `#45371f` | Pede atenção, em andamento |
| `--erro` / `--erro-veu` | `#ff6b8a` / `#4a2530` | Falhou, ação destrutiva |

### Tema claro

| Token | Valor |
| --- | --- |
| `--noite` | `#faf8ff` (papel levemente lilás) |
| `--veu` | `#ffffff` |
| `--veu-alto` | `#f1ecfd` |
| `--linha` | `#e2daf6` |
| `--texto` | `#1b1530` |
| `--texto-suave` | `#5b5480` |
| `--roxo` | `#6a35e0` (mais fundo, para manter o contraste) |
| `--ok` / `--atencao` / `--erro` | `#0c7a4b` / `#9a5600` / `#c2264d` |

### Gráficos

Séries, nesta ordem: `--serie-1` roxo, `--serie-2` verde-água, `--serie-3` âmbar, `--serie-4` rosa. Mais de 4 séries: agrupar em "outros" em vez de inventar cor.

### Regras de cor

- Texto branco só sobre `--roxo`, nunca sobre `--roxo-forte` (o contraste cai abaixo de 4,5:1).
- Link sobre fundo escuro usa `--roxo-texto`, não `--roxo`.
- Nunca usar valor de cor direto num componente: sempre o token.
- Sem gradiente decorativo. O único padrão listrado é o de "internet fora" na linha da noite.
- A linha da noite usa só tons de roxo: forte para "implementando", lilás para "portões e revisão" e apagado para "planejamento e conteúdo".

## Tipografia

| Papel | Fonte | Observação |
| --- | --- | --- |
| Títulos e números de destaque | **Bricolage Grotesque** (variável, peso 500–700) | A única fonte carregada. Tem personalidade nos títulos sem pesar |
| Texto e interface | Fonte do sistema (`system-ui`) | Zero bytes, nítida em qualquer aparelho |
| Código | Fonte monoespaçada do sistema | Só para código de verdade, nunca para rótulo |

- **Escala (razão 1,25):** 12, 14, 16, 20, 25, 31 e 39 px.
- **Pesos:** 400 no texto, 600 em rótulos e botões, 650 nos títulos.
- **Números:** sempre tabulares (`font-variant-numeric: tabular-nums`), para colunas alinharem.
- **Linha:** no máximo 68 caracteres em texto corrido.
- **Sem caixa alta** em rótulos e sem rótulo pequeno em cima de título.

**Como carregar a fonte de forma leve:** hospedar o arquivo `.woff2` variável no próprio site (pacote `@fontsource-variable/bricolage-grotesque`, licença OFL), com `font-display: swap` e `preload`. Sem a fonte, o título cai para a fonte do sistema e a tela continua correta.

## Espaço, tamanhos, raio e movimento

- **Espaço (base 4):** 4, 8, 12, 16, 24, 32, 48 e 64 px. O vão entre blocos é sempre `--vao` (24 px; 16 px no celular).
- **Tamanhos únicos:** `--altura-controle` de 40 px e `--altura-selo` de 24 px. Nenhum componente define altura própria.
- **Raio cresce com a hierarquia:** 8 px em controles (botão, campo), 14 px em painéis, pílula em selos.
- **Movimento:** só em resposta a uma ação (hover, abrir, confirmar), entre 120 e 200 ms. Nada de animação de entrada em cada seção. Respeita `prefers-reduced-motion`.
- **Foco de teclado:** sempre visível, com anel roxo.

## Layout

```
┌──────────┬────────────────────────────────────────────┐
│ Madrugada│ Título da tela                 estado  ação│
│          │ Uma frase que resume o que aconteceu       │
│ Visão    │                                            │
│ Perform. │ ▓▓▓▓████████▒▒██▓▓░░████████▒▒██▓▓         │  ← linha da noite
│ Projetos │ 01h      02h      03h      04h      05h    │
│ LinkedIn │                                            │
│ Vagas    │ 2        11 de 12     412 mil     R$ 0     │  ← números em linha
│ ...      │                                            │
│          │ ┌ Tarefas da noite ──────┐ ┌ Próximo post ┐│
│          │ │ tabela                 │ │              ││
│ [tema]   │ └────────────────────────┘ └──────────────┘│
└──────────┴────────────────────────────────────────────┘
```

- **Menu** à esquerda (216 px), com itens de 40 px e a contagem do que precisa de atenção ao lado.
- **Conteúdo alinhado à esquerda,** com largura máxima de 1.200 px. A primeira coisa da tela é uma frase que responde "o que aconteceu?".
- **Grade de colunas iguais:** `.grade-4` para os números, `.grade-3` para o corpo (o painel principal ocupa 2 colunas com `.ocupa-2`). Tudo com o mesmo vão.
- **Painéis da mesma linha com a mesma altura,** e as ações sempre na base do painel (`.pe`).

### No celular (até 860 px)

- Uma coluna só, com vão de 16 px.
- O menu lateral some e entra a **barra inferior fixa com 5 destinos** em colunas iguais (ícone e nome): Noite, Projetos, Vagas, Publicar e Mais.
- **Tabela vira lista:** o título em cima, o selo e o número embaixo. Nada rola de lado. Colunas secundárias levam `.so-computador` e somem.
- Os números ficam em 2 colunas iguais, e o botão do cabeçalho ocupa a largura toda.
- A legenda da linha da noite fica em 2 colunas alinhadas.

## Componentes

| Componente | Classe | Regra de uso |
| --- | --- | --- |
| Botão primário | `.botao.botao-primario` | No máximo um por tela ou painel |
| Botão quieto | `.botao.botao-quieto` | Ações secundárias |
| Botão de perigo | `.botao.botao-perigo` | Pausar, cancelar, despublicar. Só o texto é colorido |
| Grupo de botões | `.grupo-botoes` | Botões lado a lado com a mesma largura |
| Campo | `.campo` | Rótulo em cima, controle de 40 px, ajuda embaixo (a ajuda reserva a linha mesmo vazia, para alinhar) |
| Selo de estado | `.selo` + `.selo-ok` / `-atencao` / `-erro` / `-roxo` | Ponto e palavra, fundo neutro. Sem variante = neutro |
| Painel | `.painel` | Cabeçalho com título e um item à direita; ações na base com `.pe` |
| Grade | `.grade` + `.grade-2` / `-3` / `-4` | Colunas iguais. `.ocupa-2` para ocupar duas |
| Pilha | `.pilha` | Painéis empilhados que dividem a altura por igual |
| Número | `.painel.numero` | Valor e uma legenda curta, em células iguais |
| Linha da noite | `.noite` | Um `<span>` por trecho, com `--min` = minutos. Tipos: `t-codigo`, `t-checagem`, `t-apoio`, `t-queda`, `t-livre` |
| Tabela | `.tabela` (dentro de `.rolagem`) | Linhas de 56 px; coluna numérica com `.num`; no celular vira lista |
| Lista | `.lista` | Linhas de 56 px; item à esquerda, ação à direita |
| Abas | `.abas` > `.aba` | Trocar de visão dentro da mesma tela |
| Cartão | `.cartao` | Item de kanban (vaga, produto) |
| Medidor | `.medidor` | Aderência, cota. `--valor` em porcentagem. Ocupa a altura de um controle |
| Barra do celular | `.barra` | 5 destinos, colunas iguais |
| Vazio | `.vazio` | Diz o que fazer, não só que está vazio |

## Texto da interface

- **Em português do Brasil,** frase com maiúscula só no começo.
- **Do ponto de vista de quem usa:** "Pausar agente", não "Kill switch".
- **Botão diz o que acontece:** "Cancelar post", "Salvar alterações". A mesma palavra segue no aviso depois ("Post cancelado").
- **Erro diz o que houve e como resolver,** sem pedir desculpa e sem ser vago.
- **Tela vazia convida a agir:** "Nenhuma vaga marcada. Marque uma no radar para gerar o CV."
- **Números com unidade** e por extenso quando ajuda: "412 mil tokens", "há 40 min".

## Orçamento de leveza

| Item | Limite |
| --- | --- |
| CSS do sistema | 14 KB sem compressão (cerca de 4 KB comprimido) |
| Fontes | 1 arquivo `.woff2` variável, hospedado no próprio site |
| Imagens decorativas | Nenhuma |
| Ícones | SVG em linha, só quando ajudam (Lucide). Sem fonte de ícones |
| Gráficos | SVG feito à mão ou uPlot. Evitar biblioteca pesada de gráficos |
| JavaScript | Cada tela do painel carregada sob demanda |
| Efeitos | Sem `backdrop-filter`, sem sombra grande, sem animação contínua |

## Como usar

**HTML puro ou qualquer framework:**

```html
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
```

**Trocar de tema:**

```js
document.documentElement.dataset.theme = 'light';   // claro
delete document.documentElement.dataset.theme;      // volta ao escuro
```

**React:** importar os dois CSS uma vez na raiz e usar as classes. Os componentes React do portal são só essas classes embrulhadas.

**Tailwind (CRM):** importar o `tokens.css` e adicionar o `tailwind-preset.js` em `presets`. As classes ficam `bg-noite`, `text-texto-suave`, `bg-roxo`, `rounded-painel` e assim por diante.

**No agente:** o `projeto.yaml` de cada projeto aponta `design_system.tokens` e `design_system.componentes` para estes arquivos. A skill `reuso-primeiro` manda procurar aqui antes de criar qualquer componente ou cor.

## O que não fazer

- Criar cor, raio ou sombra fora dos tokens.
- Usar cor de estado como decoração.
- Empilhar cartões idênticos onde uma lista ou uma tabela resolve.
- Definir altura, largura ou vão próprios num componente: usar os tokens de tamanho e a grade.
- Colocar borda em volta de painel ou fundo colorido em selo.
- Deixar tabela rolar de lado no celular.
- Colocar animação de entrada em tudo.
- Escrever rótulo em caixa alta.
- Usar qualquer coisa do design system do trabalho. Este sistema é meu e foi feito do zero.
