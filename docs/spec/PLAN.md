# PLAN — <nome da feature>

Partes ordenadas, cada uma implementável num contexto novo, sem decidir nada.
Cada parte vira um item do `ROADMAP.md`.

## Partes

- [ ] **P1 — <título>** · nível: padrao · repo: <repo> · superfícies: <api, ui, dados>
  - arquivos:
  - reuso ou criação (do mapa de reuso):
  - fatia do contrato:
  - testes de aceite:
  - aceite:

- [ ] **P2 — <título>** · nível: · repo: · superfícies:
  - arquivos:
  - reuso ou criação:
  - fatia do contrato:
  - testes de aceite:
  - aceite:

- [ ] **VF — Verificação final**
  - testes e tipos: zero falha nova
  - UI (se o front mudou): fluxo inteiro, por papel de usuário
  - dados (se schema ou consulta mudou): filtros de dono e plano da consulta
  - API (se endpoint mudou): caminho feliz, bordas e "outro dono deve ser recusado"

## Completude

Antes de implementar: algum executor, num contexto novo, encontraria uma decisão que ninguém tomou
(estado de tela, ordenação, permissão, campo do contrato, teste faltando)? Se sim, a parte não está pronta.
