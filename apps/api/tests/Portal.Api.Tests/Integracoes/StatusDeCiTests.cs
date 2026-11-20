using System.Net;
using System.Runtime.CompilerServices;
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

/// <summary>Handler falso: roteia por caminho, anota tudo e nunca toca a rede (fora do host/rota → 599).</summary>
public sealed class GitHubFalsoDeCi : HttpMessageHandler
{
    public Dictionary<string, Func<HttpResponseMessage>> Rotas { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Inesperadas { get; } = [];
    private readonly object _trava = new();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        lock (_trava)
        {
            var uri = req.RequestUri!;
            if (uri.Host.Equals("api.github.com", StringComparison.OrdinalIgnoreCase) && Rotas.TryGetValue(uri.AbsolutePath, out var rota))
            {
                var resposta = rota();
                // Como o GitHub: pedido condicional com o ETag atual → 304 sem corpo.
                if (resposta.Headers.ETag is { } etag && req.Headers.IfNoneMatch.Any(e => e.Tag == etag.Tag))
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotModified));
                return Task.FromResult(resposta);
            }
            Inesperadas.Add(uri.ToString());
            return Task.FromResult(new HttpResponseMessage((HttpStatusCode)599));
        }
    }
}

[Collection("postgres")]
public class StatusDeCiTests
{
    private const string Repo = "acme/portal";
    private const string Token = "token-de-teste-ci-0001";
    private const string Sha12 = "1111111111111111111111111111111111111111";
    private const string Sha15 = "2222222222222222222222222222222222222222";

    private readonly PostgresFixture _pg;

    public StatusDeCiTests(PostgresFixture pg) => _pg = pg;

    private static string Gravacao(string nome, [CallerFilePath] string aqui = "") =>
        File.ReadAllText(Path.Combine(Path.GetDirectoryName(aqui)!, "Gravacoes", nome));

    private static HttpResponseMessage Json(string corpo, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") };

    private static void Ci(GitHubFalsoDeCi gh, string sha, string status, string checks)
    {
        gh.Rotas[$"/repos/{Repo}/commits/{sha}/status"] = () => Json(Gravacao(status));
        gh.Rotas[$"/repos/{Repo}/commits/{sha}/check-runs"] = () => Json(Gravacao(checks));
    }

    private static GitHubFalsoDeCi NovoGitHub()
    {
        var gh = new GitHubFalsoDeCi();
        gh.Rotas[$"/repos/{Repo}/pulls"] = () =>
        {
            var resposta = Json(Gravacao("prs-ci.json"));
            resposta.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"prs-ci-v1\"");
            return resposta;
        };
        return gh;
    }

    // O status de CI e o SHA ficam em PullRequest.StatusCi (string) e PullRequest.ShaUltimoCommit.
    private static string? StatusDe(PullRequest pr) =>
        (string?)typeof(PullRequest).GetProperty("StatusCi")?.GetValue(pr)
        ?? throw new Xunit.Sdk.XunitException("PullRequest.StatusCi não existe ainda.");

    private sealed class ApiGitHubFalso(string conexao, GitHubFalsoDeCi github) : ApiFactory("Testing", conexao)
    {
        protected override void ConfigurarServicos(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) =>
            builder.ConfigureTestServices(s =>
                s.AddHttpClient<ClienteGitHub>().ConfigurePrimaryHttpMessageHandler(() => github));
    }

    private async Task<ApiFactory> NovaApiAsync(GitHubFalsoDeCi gh)
    {
        var api = new ApiGitHubFalso(await _pg.NovoBancoAsync(), gh);
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> NovoWorkspaceAsync(ApiFactory api, string token)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var ws = new Workspace { Nome = "Time " + Guid.NewGuid().ToString("N")[..6] };
        db.Add(ws);
        await db.SaveChangesAsync();
        escopo.ServiceProvider.GetRequiredService<WorkspaceAtual>().Definir(ws.Id);
        var r = await escopo.ServiceProvider.GetRequiredService<GitHubConfigService>()
            .SalvarAsync(ws.Id, new GitHubConfigPedido(token, [Repo]), CancellationToken.None);
        Assert.Equal(ResultadoTipo.Ok, r.Tipo);
        return ws.Id;
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
            .Where(p => p.WorkspaceId == ws).OrderBy(p => p.Numero).ToListAsync();
    }

    [Fact]
    public async Task Tudo_concluido_com_exito_fica_sucesso()
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-sucesso.json", "checks-sucesso.json");
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        await ImportarAsync(api, ws);

        var prs = await PrsAsync(api, ws);
        Assert.Equal(["sucesso", "sucesso"], prs.Select(StatusDe));
        Assert.Empty(gh.Inesperadas);
    }

    [Theory]
    [InlineData("status-sucesso.json", "checks-falhou.json")] // check run em falha
    [InlineData("status-falhou.json", "checks-sucesso.json")] // commit status em falha
    public async Task Check_ou_status_em_falha_fica_falhou(string status, string checks)
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, status, checks);
        Ci(gh, Sha15, status, checks);
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        await ImportarAsync(api, ws);

        Assert.Equal(["falhou", "falhou"], (await PrsAsync(api, ws)).Select(StatusDe));
        Assert.Empty(gh.Inesperadas);
    }

    [Theory]
    [InlineData("status-sucesso.json", "checks-rodando.json")] // check em andamento
    [InlineData("status-pendente.json", "checks-sucesso.json")] // status pendente
    public async Task Check_ou_status_pendente_fica_rodando(string status, string checks)
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, status, checks);
        Ci(gh, Sha15, status, checks);
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        await ImportarAsync(api, ws);

        Assert.Equal(["rodando", "rodando"], (await PrsAsync(api, ws)).Select(StatusDe));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Sem_nenhum_check_nem_status_fica_sem_ci()
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-vazio.json", "checks-vazio.json");
        Ci(gh, Sha15, "status-vazio.json", "checks-vazio.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        await ImportarAsync(api, ws);

        Assert.Equal(["sem CI", "sem CI"], (await PrsAsync(api, ws)).Select(StatusDe));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Erro_500_na_primeira_pr_nao_atualiza_ela_e_nao_impede_a_segunda()
    {
        var gh = NovoGitHub();
        gh.Rotas[$"/repos/{Repo}/commits/{Sha12}/status"] = () => Json(Gravacao("erro-500.json"), HttpStatusCode.InternalServerError);
        gh.Rotas[$"/repos/{Repo}/commits/{Sha12}/check-runs"] = () => Json(Gravacao("erro-500.json"), HttpStatusCode.InternalServerError);
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        var ex = await Record.ExceptionAsync(() => ImportarAsync(api, ws));

        Assert.Null(ex);
        var prs = await PrsAsync(api, ws);
        Assert.Equal([12, 15], prs.Select(p => p.Numero));
        Assert.NotEqual("sucesso", StatusDe(prs[0]));
        Assert.Equal("sucesso", StatusDe(prs[1]));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Erro_numa_pr_mantem_o_status_anterior_dela()
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-sucesso.json", "checks-sucesso.json");
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);
        await ImportarAsync(api, ws);

        gh.Rotas[$"/repos/{Repo}/commits/{Sha12}/status"] = () => Json(Gravacao("erro-500.json"), HttpStatusCode.InternalServerError);
        Ci(gh, Sha15, "status-falhou.json", "checks-sucesso.json");
        await ImportarAsync(api, ws);

        var prs = await PrsAsync(api, ws);
        Assert.Equal("sucesso", StatusDe(prs[0])); // manteve
        Assert.Equal("falhou", StatusDe(prs[1]));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Commit_novo_com_ci_ilegivel_nao_mostra_o_ci_do_commit_antigo()
    {
        const string ShaNovo = "3333333333333333333333333333333333333333";
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-sucesso.json", "checks-sucesso.json");
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);
        await ImportarAsync(api, ws);
        Assert.Equal("sucesso", StatusDe((await PrsAsync(api, ws))[0]));

        // push na PR 12: a listagem traz o SHA novo, mas o CI dele falha na consulta
        gh.Rotas[$"/repos/{Repo}/pulls"] = () =>
        {
            var resposta = Json(Gravacao("prs-ci.json").Replace(Sha12, ShaNovo));
            resposta.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"prs-ci-v2\"");
            return resposta;
        };
        gh.Rotas[$"/repos/{Repo}/commits/{ShaNovo}/status"] = () => Json(Gravacao("erro-500.json"), HttpStatusCode.InternalServerError);
        gh.Rotas[$"/repos/{Repo}/commits/{ShaNovo}/check-runs"] = () => Json(Gravacao("erro-500.json"), HttpStatusCode.InternalServerError);
        await ImportarAsync(api, ws);
        Assert.Equal("rodando", StatusDe((await PrsAsync(api, ws))[0])); // nunca o "sucesso" do commit antigo

        // na volta seguinte (lista sem mudança, 304), o CI do commit novo é lido
        Ci(gh, ShaNovo, "status-falhou.json", "checks-sucesso.json");
        await ImportarAsync(api, ws);
        Assert.Equal("falhou", StatusDe((await PrsAsync(api, ws))[0]));
    }

    [Fact]
    public async Task Reimportar_com_status_mudado_atualiza_a_pr_sem_duplicar()
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-sucesso.json", "checks-rodando.json");
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var ws = await NovoWorkspaceAsync(api, Token);

        await ImportarAsync(api, ws);
        var antes = await PrsAsync(api, ws);
        Assert.Equal("rodando", StatusDe(antes[0]));

        Ci(gh, Sha12, "status-sucesso.json", "checks-sucesso.json");
        await ImportarAsync(api, ws);

        var depois = await PrsAsync(api, ws);
        Assert.Equal([12, 15], depois.Select(p => p.Numero));
        Assert.Equal(antes[0].Id, depois[0].Id);
        Assert.Equal("sucesso", StatusDe(depois[0]));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Status_de_ci_so_existe_no_workspace_da_configuracao()
    {
        var gh = NovoGitHub();
        Ci(gh, Sha12, "status-sucesso.json", "checks-sucesso.json");
        Ci(gh, Sha15, "status-sucesso.json", "checks-sucesso.json");
        await using var api = await NovaApiAsync(gh);
        var a = await NovoWorkspaceAsync(api, Token);
        var b = await NovoWorkspaceAsync(api, "token-de-teste-ci-0002");

        await ImportarAsync(api, a);

        Assert.Equal(["sucesso", "sucesso"], (await PrsAsync(api, a)).Select(StatusDe));
        Assert.Empty(await PrsAsync(api, b));
        Assert.Empty(gh.Inesperadas);
    }
}
