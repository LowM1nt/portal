using Portal.Api.Deploys;
using Portal.Api.Perfil;
using Portal.Api.Seguranca;

namespace Portal.Api.Workspaces;

public record CriarWorkspaceRequest(string? Nome);

public static class WorkspaceEndpoints
{
    public static void MapWorkspaces(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        // Única rota liberada do filtro de duas etapas (D-013): o web precisa saber o estado (mfaExigido) para pedir o código.
        api.MapGet("/me", async (WorkspaceService servico, CancellationToken ct) =>
            Results.Ok(await servico.ObterMeAsync(ct))).PermitirSemMfa();

        // Login do GitHub de quem está logado (filtra "Esperando você"). Vale para a pessoa, em todos os workspaces.
        api.MapPut("/me/github", async (GithubLoginPedido pedido, PerfilService servico, CancellationToken ct) =>
        {
            var r = await servico.SalvarGithubLoginAsync(pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        });

        // Ligar e desligar a exigência de duas etapas na API: só com token aal2 (o código acabou de ser conferido).
        api.MapPut("/me/mfa", async (MfaPedido pedido, HttpContext http, PerfilService servico, CancellationToken ct) =>
        {
            if (!MfaExigido.TokenAal2(http.User)) return MfaExigido.Necessario();
            var r = await servico.SalvarMfaExigidoAsync(pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        });

        api.MapPost("/workspaces", async (CriarWorkspaceRequest pedido, WorkspaceService servico, CancellationToken ct) =>
        {
            var nome = pedido.Nome?.Trim();
            if (string.IsNullOrEmpty(nome))
                return Results.BadRequest(new { erro = "Informe o nome do workspace." });
            if (nome.Length > Workspace.NomeMaximo)
                return Results.BadRequest(new { erro = $"O nome do workspace pode ter até {Workspace.NomeMaximo} caracteres." });

            if (await servico.ContarComoDonoAsync(ct) >= WorkspaceService.WorkspacesMaximosPorUsuario)
                return Results.BadRequest(new { erro = $"Você chegou ao limite de {WorkspaceService.WorkspacesMaximosPorUsuario} workspaces." });

            var criado = await servico.CriarAsync(nome, ct);
            return Results.Created($"/api/workspaces/{criado.Id}", criado);
        });

        api.MapGet("/workspaces/{id:guid}", async (Guid id, WorkspaceService servico, CancellationToken ct) =>
            await servico.ObterAsync(id, ct) is { } workspace ? Results.Ok(workspace) : Results.NotFound());
    }
}
