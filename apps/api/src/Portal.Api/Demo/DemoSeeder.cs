using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Demo;

/// <summary>Cria o workspace de demonstração com deploys fictícios. Idempotente; só toca o workspace da demo.</summary>
public static class DemoSeeder
{
    private static readonly (string Repo, string Titulo, string Ambiente, int Dia, int Hora, string Status)[] Deploys =
    [
        ("portal-web", "Calendário de deploys na tela inicial", "producao", -9, 14, "agendado"),
        ("portal-api", "Migração das tabelas de repositórios", "homologacao", -8, 10, "agendado"),
        ("portal-web", "Correção do filtro por semana", "producao", -4, 16, "agendado"),
        ("portal-api", "Limite de tamanho no título do deploy", "producao", -3, 11, "cancelado"),
        ("portal-web", "Novo tema escuro", "homologacao", 0, 15, "agendado"),
        ("portal-api", "Endpoint de listagem de pull requests", "producao", 1, 9, "agendado"),
        ("portal-web", "Tela de pull requests abertos", "producao", 3, 13, "agendado"),
        ("portal-api", "Ajustes de desempenho nas consultas", "homologacao", 6, 17, "agendado"),
        ("portal-web", "Revisão dos textos da interface", "producao", 8, 10, "agendado"),
        ("portal-api", "Publicação da versão 1.0", "producao", 10, 14, "agendado"),
    ];

    /// <summary>
    /// Semeia a demo. Se ela já existe e o deploy mais recente já passou, recria só os deploys e
    /// repositórios do workspace da demo, para a semana atual nunca ficar vazia.
    /// </summary>
    public static async Task SemearAsync(PortalDbContext db, CancellationToken ct = default, TimeProvider? relogio = null)
    {
        var hoje = (relogio ?? TimeProvider.System).GetUtcNow().UtcDateTime.Date;
        var existe = await db.Workspaces.AnyAsync(w => w.Id == DemoWorkspace.Id, ct);

        if (existe)
        {
            var limite = new DateTimeOffset(hoje, TimeSpan.Zero);
            var vigente = await db.Deploys.IgnoreQueryFilters()
                .AnyAsync(d => d.WorkspaceId == DemoWorkspace.Id && d.AgendadoPara >= limite, ct);
            if (vigente) return;
            await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id).ExecuteDeleteAsync(ct);
            await db.Repositorios.IgnoreQueryFilters().Where(r => r.WorkspaceId == DemoWorkspace.Id).ExecuteDeleteAsync(ct);
        }
        else
        {
            db.Workspaces.Add(new Workspace { Id = DemoWorkspace.Id, Nome = DemoWorkspace.Nome });
        }

        var repos = new Dictionary<string, Repositorio>();
        foreach (var nome in Deploys.Select(d => d.Repo).Distinct())
        {
            var repo = new Repositorio { WorkspaceId = DemoWorkspace.Id, Nome = nome };
            repos[nome] = repo;
            db.Repositorios.Add(repo);
        }

        foreach (var d in Deploys)
        {
            db.Deploys.Add(new Deploy
            {
                WorkspaceId = DemoWorkspace.Id,
                RepositorioId = repos[d.Repo].Id,
                Titulo = d.Titulo,
                Ambiente = d.Ambiente,
                Status = d.Status == "cancelado" ? DeploysService.StatusCancelado : DeploysService.StatusAgendado,
                AgendadoPara = new DateTimeOffset(hoje.AddDays(d.Dia).AddHours(d.Hora), TimeSpan.Zero),
            });
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (!existe)
        {
            // Outra instância semeou ao mesmo tempo (chave duplicada): já está semeado.
            db.ChangeTracker.Clear();
            if (!await db.Workspaces.AnyAsync(w => w.Id == DemoWorkspace.Id, ct)) throw;
        }
    }
}
