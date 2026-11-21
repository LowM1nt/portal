using Portal.Api.Deploys;

namespace Portal.Api.Workspaces;

public static class MembrosEndpoints
{
    public static void MapMembros(this IEndpointRouteBuilder app)
    {
        var ws = app.MapGroup("/api/workspace").RequerWorkspace();

        ws.MapGet("/membros", async (WorkspaceAtual atual, MembrosService servico, CancellationToken ct) =>
            Results.Ok(await servico.ListarAsync(atual.Id, ct)));

        ws.MapPatch("/membros/{usuarioId:guid}", async (Guid usuarioId, PapelPedido pedido, WorkspaceAtual atual, MembrosService servico, CancellationToken ct) =>
            Converter(await servico.MudarPapelAsync(atual.Id, usuarioId, pedido, ct))).RequerPapel(Papeis.Dono);

        ws.MapDelete("/membros/{usuarioId:guid}", async (Guid usuarioId, WorkspaceAtual atual, MembrosService servico, CancellationToken ct) =>
        {
            var r = await servico.RemoverAsync(atual.Id, usuarioId, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.NoContent() : Converter(r);
        }).RequerPapel(Papeis.Dono);

        ws.MapPost("/convites", async (ConvitePedido pedido, WorkspaceAtual atual, MembrosService servico, CancellationToken ct) =>
        {
            var r = await servico.ConvidarAsync(atual.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Created($"/api/workspace/convites/{r.Valor!.Id}", r.Valor) : Converter(r);
        }).RequerPapel(Papeis.Dono);

        // Quem aceita ainda não é membro: só exige login, sem X-Workspace-Id.
        app.MapPost("/api/convites/aceitar", async (AceitarConvitePedido pedido, MembrosService servico, CancellationToken ct) =>
            Converter(await servico.AceitarAsync(pedido, ct))).RequireAuthorization();
    }

    private static IResult Converter<T>(Resultado<T> r) => r.Tipo switch
    {
        ResultadoTipo.Ok => Results.Ok(r.Valor),
        ResultadoTipo.NaoEncontrado => Results.NotFound(),
        ResultadoTipo.Conflito => Results.Conflict(new { erro = r.Erro }),
        _ => Results.BadRequest(new { erro = r.Erro }),
    };
}
