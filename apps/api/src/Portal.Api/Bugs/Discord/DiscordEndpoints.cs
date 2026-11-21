using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Bugs.Discord;

public static class DiscordEndpoints
{
    public static void MapDiscord(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/integracoes/discord").RequerWorkspace();

        api.MapGet("", async (DiscordConfigService servico, CancellationToken ct) =>
            Results.Ok(await servico.ObterAsync(ct)));

        api.MapPut("", async (DiscordConfigPedido pedido, WorkspaceAtual ws, DiscordConfigService servico, CancellationToken ct) =>
        {
            var r = await servico.SalvarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        }).RequerPapel(Papeis.Dono);

        api.MapDelete("", async (WorkspaceAtual ws, DiscordConfigService servico, CancellationToken ct) =>
        {
            await servico.ApagarAsync(ws.Id, ct);
            return Results.NoContent();
        }).RequerPapel(Papeis.Dono);
    }
}
