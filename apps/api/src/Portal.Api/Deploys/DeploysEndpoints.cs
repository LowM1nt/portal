using Portal.Api.Workspaces;

namespace Portal.Api.Deploys;

public static class DeploysEndpoints
{
    public static void MapDeploys(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/deploys").RequerWorkspace();

        api.MapGet("", async (string? semana, DeploysService servico, CancellationToken ct) =>
            Converter(await servico.ListarPorSemanaAsync(semana, ct)));

        api.MapGet("/{id:guid}", async (Guid id, DeploysService servico, CancellationToken ct) =>
            await servico.ObterAsync(id, ct) is { } d ? Results.Ok(d) : Results.NotFound());

        api.MapPost("", async (DeployPedido pedido, WorkspaceAtual ws, DeploysService servico, CancellationToken ct) =>
        {
            var r = await servico.CriarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Created($"/api/deploys/{r.Valor!.Id}", r.Valor) : Converter(r);
        });

        api.MapPut("/{id:guid}", async (Guid id, DeployPedido pedido, DeploysService servico, CancellationToken ct) =>
            Converter(await servico.EditarAsync(id, pedido, ct)));

        api.MapDelete("/{id:guid}", async (Guid id, DeploysService servico, CancellationToken ct) =>
            Converter(await servico.CancelarAsync(id, ct)));
    }

    private static IResult Converter<T>(Resultado<T> r) => r.Tipo switch
    {
        ResultadoTipo.Ok => Results.Ok(r.Valor),
        ResultadoTipo.NaoEncontrado => Results.NotFound(),
        ResultadoTipo.Conflito => Results.Conflict(new { erro = r.Erro }),
        _ => Results.BadRequest(new { erro = r.Erro }),
    };
}
