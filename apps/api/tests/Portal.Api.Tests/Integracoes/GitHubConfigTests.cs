using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Portal.Api.Dados;
using Portal.Api.Integracoes.GitHub;

namespace Portal.Api.Tests;

/// <summary>Captura tudo que a API loga (mensagem + exceção), para provar que o token não vaza.</summary>
public sealed class LogsCapturados : ILoggerProvider
{
    public ConcurrentQueue<string> Linhas { get; } = new();

    public ILogger CreateLogger(string categoria) => new Capturador(Linhas);

    public void Dispose()
    {
    }

    private sealed class Capturador(ConcurrentQueue<string> linhas) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            linhas.Enqueue(formatter(state, exception) + " " + exception);
    }
}

public class ApiComLogsCapturados : ApiFactory
{
    public LogsCapturados Logs { get; } = new();

    public ApiComLogsCapturados(string conexao) : base("Testing", conexao)
    {
    }

    protected override void ConfigurarServicos(IWebHostBuilder builder) =>
        builder.ConfigureLogging(l =>
        {
            l.SetMinimumLevel(LogLevel.Trace);
            l.AddProvider(Logs);
        });
}

[Collection("postgres")]
public class GitHubConfigTests
{
    private const string Rota = "/api/integracoes/github";
    private const string Token = "github_pat_SEGREDO_unico_0123456789_wxyz";

    private readonly PostgresFixture _pg;

    public GitHubConfigTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiComLogsCapturados> NovaApiAsync()
    {
        var api = new ApiComLogsCapturados(await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario)
    {
        using var c = api.ClienteCom(usuario);
        var r = await c.PostAsJsonAsync("/api/workspaces", new { nome = "Time" });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task<(HttpClient Cliente, Guid Workspace)> NovoUsuario(ApiFactory api)
    {
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario);
        return (api.ClienteCom(usuario, workspace: ws), ws);
    }

    private static Task<HttpResponseMessage> Salvar(HttpClient c, string token = Token, string[]? repos = null) =>
        c.PutAsJsonAsync(Rota, new { token, repositorios = repos ?? new[] { "acme/portal", "acme/api" } });

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Put_valido_devolve_configurado_finalToken_e_repositorios_sem_o_token()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;

        using var resp = await Salvar(c);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var texto = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain(Token, texto);
        var json = JsonDocument.Parse(texto).RootElement;
        Assert.True(json.GetProperty("configurado").GetBoolean());
        Assert.Equal("wxyz", json.GetProperty("finalToken").GetString());
        Assert.Equal(new[] { "acme/portal", "acme/api" },
            json.GetProperty("repositorios").EnumerateArray().Select(e => e.GetString()).ToArray());
    }

    [Fact]
    public async Task Get_depois_do_put_devolve_os_campos_do_contrato_sem_o_token()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;
        (await Salvar(c)).Dispose();

        using var resp = await c.GetAsync(Rota);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var texto = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain(Token, texto);
        var json = JsonDocument.Parse(texto).RootElement;
        Assert.True(json.GetProperty("configurado").GetBoolean());
        Assert.Equal("wxyz", json.GetProperty("finalToken").GetString());
        Assert.Equal(2, json.GetProperty("repositorios").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, json.GetProperty("ultimaSincronizacao").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.GetProperty("ultimoErro").ValueKind);
    }

    [Fact]
    public async Task Get_sem_configuracao_devolve_configurado_false()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;

        using var resp = await c.GetAsync(Rota);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.False((await Json(resp)).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Delete_devolve_204_e_o_get_seguinte_mostra_configurado_false()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;
        (await Salvar(c)).Dispose();

        using var del = await c.DeleteAsync(Rota);
        using var get = await c.GetAsync(Rota);

        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.False((await Json(get)).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Put_com_token_vazio_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;

        foreach (var vazio in new[] { "", "   " })
        {
            using var resp = await Salvar(c, vazio);
            Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        }
    }

    [Theory]
    [InlineData("repo-sem-dono")]
    [InlineData("a/b/c")]
    [InlineData("")]
    [InlineData("/repo")]
    [InlineData("dono/")]
    public async Task Put_com_repositorio_mal_formado_devolve_400(string repo)
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;

        using var resp = await Salvar(c, repos: new[] { "acme/portal", repo });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        using var get = await c.GetAsync(Rota);
        Assert.False((await Json(get)).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Outro_workspace_nao_ve_nem_altera_a_configuracao_do_primeiro()
    {
        await using var api = await NovaApiAsync();
        var (ana, wsAna) = await NovoUsuario(api);
        var (beto, _) = await NovoUsuario(api);
        using var _a = ana;
        using var _b = beto;
        (await Salvar(ana)).Dispose();

        // Beto, no próprio workspace, não vê a configuração da Ana.
        using var getBeto = await beto.GetAsync(Rota);
        Assert.Equal(HttpStatusCode.OK, getBeto.StatusCode);
        Assert.False((await Json(getBeto)).GetProperty("configurado").GetBoolean());

        // Beto escreve e apaga no próprio workspace: nada muda para a Ana.
        (await Salvar(beto, "outro-token-do-beto-1234", new[] { "beto/app" })).Dispose();
        using var delBeto = await beto.DeleteAsync(Rota);
        Assert.Equal(HttpStatusCode.NoContent, delBeto.StatusCode);

        // Beto apontando para o workspace da Ana (não é membro): 404 em GET/PUT/DELETE.
        using var intruso = api.ClienteCom(Guid.NewGuid(), workspace: wsAna);
        using var g = await intruso.GetAsync(Rota);
        using var p = await Salvar(intruso, "token-intruso-9999");
        using var d = await intruso.DeleteAsync(Rota);
        Assert.Equal(HttpStatusCode.NotFound, g.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, p.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, d.StatusCode);

        using var original = await ana.GetAsync(Rota);
        var json = await Json(original);
        Assert.True(json.GetProperty("configurado").GetBoolean());
        Assert.Equal("wxyz", json.GetProperty("finalToken").GetString());
        Assert.Equal(new[] { "acme/portal", "acme/api" },
            json.GetProperty("repositorios").EnumerateArray().Select(e => e.GetString()).ToArray());
    }

    [Fact]
    public async Task Sem_bearer_devolve_401_e_workspace_sem_ser_membro_devolve_404()
    {
        await using var api = await NovaApiAsync();
        var (c, ws) = await NovoUsuario(api);
        using var _c = c;

        using var anonimo = api.CreateClient();
        anonimo.DefaultRequestHeaders.Add("X-Workspace-Id", ws.ToString());
        using var get = await anonimo.GetAsync(Rota);
        using var put = await Salvar(anonimo);
        using var del = await anonimo.DeleteAsync(Rota);
        Assert.Equal(HttpStatusCode.Unauthorized, get.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, put.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, del.StatusCode);

        using var forasteiro = api.ClienteCom(Guid.NewGuid(), workspace: Guid.NewGuid());
        using var naoMembro = await forasteiro.GetAsync(Rota);
        Assert.Equal(HttpStatusCode.NotFound, naoMembro.StatusCode);
    }

    [Fact]
    public async Task Token_e_gravado_cifrado_e_decifravel_pelo_data_protection()
    {
        await using var api = await NovaApiAsync();
        var (c, ws) = await NovoUsuario(api);
        using var _c = c;
        (await Salvar(c)).Dispose();

        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var linha = await db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters().SingleAsync(x => x.WorkspaceId == ws);

        Assert.NotEqual(Token, linha.TokenCriptografado);
        Assert.DoesNotContain(Token, linha.TokenCriptografado);
        Assert.Equal("wxyz", linha.FinalToken);
        var protetor = escopo.ServiceProvider.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector(GitHubConfigService.Proposito);
        Assert.Equal(Token, protetor.Unprotect(linha.TokenCriptografado));
    }

    [Fact]
    public async Task Token_nao_aparece_nos_logs_durante_put_e_get()
    {
        await using var api = await NovaApiAsync();
        var (c, _) = await NovoUsuario(api);
        using var _c = c;

        (await Salvar(c)).Dispose();
        (await c.GetAsync(Rota)).Dispose();

        Assert.NotEmpty(api.Logs.Linhas);
        Assert.DoesNotContain(api.Logs.Linhas, l => l.Contains(Token) || l.Contains("SEGREDO_unico"));
    }
}
