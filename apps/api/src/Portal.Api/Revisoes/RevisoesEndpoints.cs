using Portal.Api.Workspaces;

namespace Portal.Api.Revisoes;

public static class RevisoesEndpoints
{
    public static void MapRevisoes(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/revisoes").RequerWorkspace();

        api.MapGet("", async (string? repositorio, string? revisor, RevisoesService servico, CancellationToken ct) =>
            Results.Ok(await servico.ListarAsync(repositorio, revisor, ct)));
    }
}
