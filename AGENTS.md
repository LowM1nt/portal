# AGENTS.md

Antes de qualquer trabalho neste repositório:

1. **`projeto.yaml`**: caminhos, comandos (testar, tipos, lint, build, rodar), registro de tarefas,
   design system e invariantes. Use os comandos de lá; não invente outros.
2. **`ROADMAP.md`**: pegue o próximo item `[ ]`, respeitando nível, arquivos e aceite.
3. **Skills** (do kit pessoal): `escopo-minimo`, `registro-de-trabalho`, `reuso-primeiro`,
   `feature-workflow`, `revisao-completa` e `revisao-de-pr`. Siga a skill da situação.

Regras curtas:

- A especificação do produto (`docs/spec/`) é escrita pelo dono. Não preencha nem invente
  funcionalidade (clean-room: nada copiado de outro sistema).
- Textos da interface em pt-BR. Segredos só no `.env`, nunca no git.
- Só abra PR com todos os portões verdes (CI, CodeQL e Semgrep).
