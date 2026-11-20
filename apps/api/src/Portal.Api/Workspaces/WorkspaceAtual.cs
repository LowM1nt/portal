using Microsoft.EntityFrameworkCore;
using Portal.Api.Auth;
using Portal.Api.Dados;

namespace Portal.Api.Workspaces;

/// <summary>
/// Workspace ativo da requisição (cabeçalho X-Workspace-Id). Scoped. Só é preenchido depois de
/// confirmar que o usuário é membro; antes disso <see cref="Id"/> é vazio e o query filter não devolve nada.
/// </summary>
public class WorkspaceAtual
{
    public const string Cabecalho = "X-Workspace-Id";

    public Guid Id { get; private set; }

    public void Definir(Guid id) => Id = id;
}

public static class WorkspaceAtualExtensions
{
    /// <summary>
    /// Rota de negócio: exige Bearer e X-Workspace-Id. Ausente ou malformado → 400; não membro ou inexistente → 404.
    /// </summary>
    public static TBuilder RequerWorkspace<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder
    {
        builder.RequireAuthorization();
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            if (!Guid.TryParse(http.Request.Headers[WorkspaceAtual.Cabecalho].FirstOrDefault(), out var id) || id == Guid.Empty)
                return Results.BadRequest(new { erro = "Informe o workspace no cabeçalho X-Workspace-Id." });

            var usuario = http.RequestServices.GetRequiredService<UsuarioAtual>();
            var db = http.RequestServices.GetRequiredService<PortalDbContext>();
            var membro = await db.Set<WorkspaceMembro>()
                .AnyAsync(m => m.WorkspaceId == id && m.UsuarioId == usuario.Id, http.RequestAborted);
            if (!membro) return Results.NotFound();

            http.RequestServices.GetRequiredService<WorkspaceAtual>().Definir(id);
            return await next(ctx);
        });
        return builder;
    }
}
