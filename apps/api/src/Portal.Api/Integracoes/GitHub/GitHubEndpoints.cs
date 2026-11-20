using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Integracoes.GitHub;

public static class GitHubEndpoints
{
    public static void MapGitHub(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/integracoes/github").RequerWorkspace();

        api.MapGet("", async (GitHubConfigService servico, CancellationToken ct) =>
            Results.Ok(await servico.ObterAsync(ct)));

        api.MapPut("", async (GitHubConfigPedido pedido, WorkspaceAtual ws, GitHubConfigService servico, CancellationToken ct) =>
        {
            var r = await servico.SalvarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        });

        api.MapDelete("", async (GitHubConfigService servico, CancellationToken ct) =>
        {
            await servico.ApagarAsync(ct);
            return Results.NoContent();
        });
    }
}
