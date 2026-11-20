using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Demo;

public static class DemoEndpoints
{
    /// <summary>Leitura pública do workspace de demonstração. Escrita é sempre recusada (405).</summary>
    public static void MapDemo(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/demo");

        api.MapGet("/deploys", async (string? semana, WorkspaceAtual ws, DeploysService servico, CancellationToken ct) =>
        {
            ws.Definir(DemoWorkspace.Id);
            var r = await servico.ListarPorSemanaAsync(semana, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        });

        api.MapMethods("/{**resto}", ["POST", "PUT", "PATCH", "DELETE"], () => Results.StatusCode(StatusCodes.Status405MethodNotAllowed));
        api.MapMethods("", ["POST", "PUT", "PATCH", "DELETE"], () => Results.StatusCode(StatusCodes.Status405MethodNotAllowed));
    }
}
