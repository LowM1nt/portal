# Portal

Portal open source e self-hosted para times pequenos de dev acompanharem o que sobe, o que está em
revisão e o que está quebrado.

> Em construção. Por enquanto é só o esqueleto do monorepo.

## Stack

| App | Caminho | Stack |
| --- | --- | --- |
| Web | `apps/web` | React + TypeScript (Vite), Vitest e Testing Library |
| Painel | `apps/painel` | React + TypeScript (Vite), Vitest e Testing Library |
| API | `apps/api` | ASP.NET Core (.NET 8), xUnit |
| Banco | `docker-compose.yml` | Postgres 16 |

## Como rodar

Requisitos: Node 22 ou mais novo, .NET 8 SDK e Docker.

```bash
# API + Postgres
cp .env.example .env        # troque a senha
docker compose up --build   # API em http://127.0.0.1:8080/health

# Web (ou painel)
cd apps/web
npm ci
npm run dev                 # http://localhost:5173
```

## Como testar

```bash
# Web e painel (em apps/web e apps/painel)
npm ci && npx tsc --noEmit && npm run lint && npm test -- --run && npm run build

# API (em apps/api)
dotnet restore && dotnet build --no-restore -warnaserror && dotnet test --no-build
```

Os mesmos comandos rodam no CI (`.github/workflows/ci.yml`), junto com o CodeQL e o Semgrep
(`.semgrep/`).

## Documentos

- Especificação do produto: `docs/spec/` (PRD, SPEC e PLAN, escritos pelo dono do projeto).
- Roadmap: `ROADMAP.md`.
- Design system (fonte): `docs/design-system/`.
- Configuração para o agente: `projeto.yaml` e `AGENTS.md`.

## Licença

MIT. Veja `LICENSE`.
