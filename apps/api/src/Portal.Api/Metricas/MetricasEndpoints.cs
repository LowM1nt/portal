using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Metricas;

public static class MetricasEndpoints
{
    public static void MapMetricas(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/api/metricas").RequerWorkspace()
            .MapGet("", async (string? semanas, MetricasService servico, CancellationToken ct) =>
            {
                var r = await servico.CalcularAsync(semanas, ct);
                return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
            });
    }
}
