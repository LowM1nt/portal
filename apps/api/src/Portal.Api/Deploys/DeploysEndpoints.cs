using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Deploys;

public record RepositorioResposta(Guid Id, string Nome);

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

        // Qualquer membro do workspace marca como foi o deploy (RequerWorkspace já garante o vínculo).
        api.MapPatch("/{id:guid}/status", async (Guid id, StatusPedido pedido, DeploysService servico, CancellationToken ct) =>
            Converter(await servico.MudarStatusAsync(id, pedido, ct)));

        api.MapDelete("/{id:guid}", async (Guid id, DeploysService servico, CancellationToken ct) =>
            Converter(await servico.CancelarAsync(id, ct)));

        // Repositórios do workspace (para o formulário de deploy). O query filter limita ao workspace atual.
        app.MapGroup("/api/repositorios").RequerWorkspace()
            .MapGet("", async (PortalDbContext db, CancellationToken ct) =>
                Results.Ok(await db.Repositorios.AsNoTracking()
                    .OrderBy(r => r.Nome).ThenBy(r => r.Id)
                    .Select(r => new RepositorioResposta(r.Id, r.Nome))
                    .ToListAsync(ct)));
    }

    private static IResult Converter<T>(Resultado<T> r) => r.Tipo switch
    {
        ResultadoTipo.Ok => Results.Ok(r.Valor),
        ResultadoTipo.NaoEncontrado => Results.NotFound(),
        ResultadoTipo.Conflito => Results.Conflict(new { erro = r.Erro }),
        _ => Results.BadRequest(new { erro = r.Erro }),
    };
}
