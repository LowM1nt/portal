using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Roadmap;

public static class RoadmapEndpoints
{
    public static void MapRoadmap(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/roadmap").RequerWorkspace();

        api.MapGet("", async (string? status, RoadmapService servico, CancellationToken ct) =>
            Converter(await servico.ListarAsync(status, ct)));

        api.MapGet("/{id:guid}", async (Guid id, RoadmapService servico, CancellationToken ct) =>
            await servico.ObterAsync(id, ct) is { } i ? Results.Ok(i) : Results.NotFound());

        api.MapPost("", async (ItemRoadmapPedido pedido, WorkspaceAtual ws, RoadmapService servico, CancellationToken ct) =>
        {
            var r = await servico.CriarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Created($"/api/roadmap/{r.Valor!.Id}", r.Valor) : Converter(r);
        });

        api.MapPut("/{id:guid}", async (Guid id, ItemRoadmapPedido pedido, RoadmapService servico, CancellationToken ct) =>
            Converter(await servico.EditarAsync(id, pedido, ct)));

        api.MapPatch("/{id:guid}/status", async (Guid id, StatusPedido pedido, RoadmapService servico, CancellationToken ct) =>
            Converter(await servico.MoverAsync(id, pedido, ct)));

        api.MapDelete("/{id:guid}", async (Guid id, RoadmapService servico, CancellationToken ct) =>
            await servico.ApagarAsync(id, ct) ? Results.NoContent() : Results.NotFound());
    }

    private static IResult Converter<T>(Resultado<T> r) => r.Tipo switch
    {
        ResultadoTipo.Ok => Results.Ok(r.Valor),
        ResultadoTipo.NaoEncontrado => Results.NotFound(),
        ResultadoTipo.Conflito => Results.Conflict(new { erro = r.Erro }),
        _ => Results.BadRequest(new { erro = r.Erro }),
    };
}
