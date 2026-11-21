using System.Net;
using System.Text;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Deploys;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Integracoes;

[Collection("postgres")]
public class ImportadorDeRevisoresTests
{
    private const string Repo = "acme/portal";
    private const string Token = "token-de-teste-workspace-a-0001";

    private readonly PostgresFixture _pg;

    public ImportadorDeRevisoresTests(PostgresFixture pg) => _pg = pg;

    private static string Gravacao(string nome, [System.Runtime.CompilerServices.CallerFilePath] string aqui = "") =>
        File.ReadAllText(Path.Combine(Path.GetDirectoryName(aqui)!, "Gravacoes", nome));

    private static HttpResponseMessage Json(string corpo) =>
        new(HttpStatusCode.OK) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") };

    private sealed class ApiGitHubFalso(string conexao, GitHubFalso github) : ApiFactory("Testing", conexao)
    {
        protected override void ConfigurarServicos(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) =>
            builder.ConfigureTestServices(s =>
                s.AddHttpClient<ClienteGitHub>().ConfigurePrimaryHttpMessageHandler(() => github));
    }

    private async Task<(ApiFactory Api, Guid Ws)> NovoMundoAsync(GitHubFalso github)
    {
        var api = new ApiGitHubFalso(await _pg.NovoBancoAsync(), github);
        await api.MigrarAsync();
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var ws = new Workspace { Nome = "Time" };
        db.Add(ws);
        await db.SaveChangesAsync();
        escopo.ServiceProvider.GetRequiredService<WorkspaceAtual>().Definir(ws.Id);
        var r = await escopo.ServiceProvider.GetRequiredService<GitHubConfigService>()
            .SalvarAsync(ws.Id, new GitHubConfigPedido(Token, [Repo]), CancellationToken.None);
        Assert.Equal(ResultadoTipo.Ok, r.Tipo);
        return (api, ws.Id);
    }

    private static async Task ImportarAsync(ApiFactory api, Guid ws)
    {
        using var escopo = api.Services.CreateScope();
        await escopo.ServiceProvider.GetRequiredService<ImportadorDePrs>()
            .ImportarWorkspaceAsync(ws, CancellationToken.None);
    }

    private static async Task<List<PullRequest>> PrsAsync(ApiFactory api, Guid ws)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return await db.PullRequests.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.WorkspaceId == ws).ToListAsync();
    }

    [Fact]
    public async Task Importacao_grava_draft_revisores_e_equipes_na_pr_do_workspace()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("prs-revisores.json")));
        var (api, ws) = await NovoMundoAsync(gh);
        await using var _ = api;

        await ImportarAsync(api, ws);

        var pr = Assert.Single(await PrsAsync(api, ws));
        Assert.Equal(ws, pr.WorkspaceId);
        Assert.Equal(21, pr.Numero);
        Assert.True(pr.Draft);
        Assert.Equal(["bruno-dev", "carla-dev"], pr.RevisoresSolicitados);
        Assert.Equal(["Time Backend"], pr.EquipesSolicitadas);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Reimportar_apos_revisao_atualiza_os_revisores_sem_duplicar()
    {
        var corpo = Gravacao("prs-revisores.json");
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(corpo));
        var (api, ws) = await NovoMundoAsync(gh);
        await using var _ = api;
        await ImportarAsync(api, ws);

        corpo = Gravacao("prs-revisores-revisado.json");
        await ImportarAsync(api, ws);

        var pr = Assert.Single(await PrsAsync(api, ws));
        Assert.False(pr.Draft);
        Assert.Empty(pr.RevisoresSolicitados);
        Assert.Empty(pr.EquipesSolicitadas);
        Assert.Empty(gh.Inesperadas);
    }
}
