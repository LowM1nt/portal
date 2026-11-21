using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Bugs;

public static class BugsEndpoints
{
    public static void MapBugs(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/bugs").RequerWorkspace();

        api.MapGet("", async (string? status, BugsService servico, CancellationToken ct) =>
            Converter(await servico.ListarAsync(status, ct)));

        api.MapGet("/{id:guid}", async (Guid id, BugsService servico, CancellationToken ct) =>
            await servico.ObterAsync(id, ct) is { } b ? Results.Ok(b) : Results.NotFound());

        api.MapPost("", async (BugPedido pedido, WorkspaceAtual ws, BugsService servico, CancellationToken ct) =>
        {
            var r = await servico.CriarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Created($"/api/bugs/{r.Valor!.Id}", r.Valor) : Converter(r);
        });

        api.MapPatch("/{id:guid}/status", async (Guid id, BugStatusPedido pedido, BugsService servico, CancellationToken ct) =>
            Converter(await servico.MudarStatusAsync(id, pedido, ct)));
    }

    private static IResult Converter<T>(Resultado<T> r) => r.Tipo switch
    {
        ResultadoTipo.Ok => Results.Ok(r.Valor),
        ResultadoTipo.NaoEncontrado => Results.NotFound(),
        _ => Results.BadRequest(new { erro = r.Erro }),
    };
}
