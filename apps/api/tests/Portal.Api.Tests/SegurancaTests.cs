using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests;

/// <summary>API com configurações extras definidas pelo teste.</summary>
public class ApiConfigurada : ApiFactory
{
    private readonly Dictionary<string, string> _extras;

    public ApiConfigurada(Dictionary<string, string> extras, string conexao = ConexaoSemBanco) : base("Testing", conexao) =>
        _extras = extras;

    protected override void ConfigurarServicos(IWebHostBuilder builder)
    {
        foreach (var (chave, valor) in _extras) builder.UseSetting(chave, valor);
    }
}

/// <summary>Provas das proteções da auditoria de 20/11/2026 (sem banco).</summary>
public class SegurancaSemBancoTests
{
    [Fact]
    public async Task Anonimo_passou_do_limite_recebe_429_com_mensagem()
    {
        using var api = new ApiConfigurada(new() { ["RateLimit:AnonimoPorMinuto"] = "3" });
        using var c = api.CreateClient();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/me")).StatusCode);

        var bloqueada = await c.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.TooManyRequests, bloqueada.StatusCode);
        Assert.Equal("60", bloqueada.Headers.GetValues("Retry-After").Single());
        Assert.Contains("Muitas requisições", await bloqueada.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Health_nunca_e_limitado()
    {
        using var api = new ApiConfigurada(new() { ["RateLimit:AnonimoPorMinuto"] = "1" });
        using var c = api.CreateClient();
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Limite_autenticado_e_por_usuario()
    {
        using var api = new ApiConfigurada(new() { ["RateLimit:AutenticadoPorMinuto"] = "2" });
        // Token aal2 não consulta o banco no filtro de duas etapas (D-013); sem X-Workspace-Id a rota responde 400
        // antes do banco: só o limite importa aqui.
        using var a = api.ClienteCom(Guid.NewGuid(), aal: "aal2");
        using var b = api.ClienteCom(Guid.NewGuid(), aal: "aal2");
        Assert.Equal(HttpStatusCode.BadRequest, (await a.GetAsync("/api/deploys")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.GetAsync("/api/deploys")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await a.GetAsync("/api/deploys")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await b.GetAsync("/api/deploys")).StatusCode);
    }

    [Fact]
    public void Caminho_de_producao_so_aceita_algoritmos_assimetricos_do_supabase()
    {
        using var api = new ApiConfigurada(new() { ["Jwt:ChaveTeste"] = "", ["Supabase:Url"] = "https://127.0.0.1:1" });
        var opcoes = api.Services.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>().Get(JwtBearerDefaults.AuthenticationScheme);
        Assert.Equal(new[] { SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256 }, opcoes.TokenValidationParameters.ValidAlgorithms);
        Assert.True(opcoes.TokenValidationParameters.ValidateIssuer);
        Assert.Equal("https://127.0.0.1:1/auth/v1", opcoes.TokenValidationParameters.ValidIssuer);
    }

    [Fact]
    public async Task Caminho_de_producao_recusa_token_simetrico()
    {
        using var api = new ApiConfigurada(new() { ["Jwt:ChaveTeste"] = "", ["Supabase:Url"] = "https://127.0.0.1:1" });
        using var c = api.CreateClient();
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TokenDeTeste.Gerar(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/me")).StatusCode);
    }
}

[Collection("postgres")]
public class SegurancaComBancoTests
{
    private const string Rota = "/api/integracoes/github";
    private readonly PostgresFixture _pg;

    public SegurancaComBancoTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> CriarWorkspace(HttpClient c)
    {
        var r = await c.PostAsJsonAsync("/api/workspaces", new { nome = "Time" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Repositorio_com_ponto_ponto_e_recusado()
    {
        using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api.ClienteCom(usuario));
        using var c = api.ClienteCom(usuario, workspace: ws);
        foreach (var repo in new[] { "../usuario", "dono/..", "./repo" })
        {
            var r = await c.PutAsJsonAsync(Rota, new { token = "abc123456", repositorios = new[] { repo } });
            Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        }
    }

    [Fact]
    public async Task Mais_de_50_repositorios_e_recusado()
    {
        using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api.ClienteCom(usuario));
        using var c = api.ClienteCom(usuario, workspace: ws);
        var muitos = Enumerable.Range(1, 51).Select(i => $"dono/repo{i}").ToArray();
        var r = await c.PutAsJsonAsync(Rota, new { token = "abc123456", repositorios = muitos });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("50", await r.Content.ReadAsStringAsync());

        var ok = await c.PutAsJsonAsync(Rota, new { token = "abc123456", repositorios = muitos.Take(50).ToArray() });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Membro_comum_le_mas_nao_muda_integracao()
    {
        using var api = await NovaApiAsync();
        var dono = Guid.NewGuid();
        var membro = Guid.NewGuid();
        var ws = await CriarWorkspace(api.ClienteCom(dono));
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            db.WorkspaceMembros.Add(new WorkspaceMembro { WorkspaceId = ws, UsuarioId = membro, Papel = Papeis.Membro });
            await db.SaveChangesAsync();
        }

        using var c = api.ClienteCom(membro, workspace: ws);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(Rota)).StatusCode);
        var put = await c.PutAsJsonAsync(Rota, new { token = "abc123456", repositorios = new[] { "dono/repo" } });
        Assert.Equal(HttpStatusCode.Forbidden, put.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.DeleteAsync(Rota)).StatusCode);

        using var d = api.ClienteCom(dono, workspace: ws);
        Assert.Equal(HttpStatusCode.OK, (await d.PutAsJsonAsync(Rota, new { token = "abc123456", repositorios = new[] { "dono/repo" } })).StatusCode);
    }

    [Fact]
    public async Task Usuario_nao_cria_mais_que_o_limite_de_workspaces()
    {
        using var api = await NovaApiAsync();
        using var c = api.ClienteCom(Guid.NewGuid());
        for (var i = 0; i < WorkspaceService.WorkspacesMaximosPorUsuario; i++)
            Assert.Equal(HttpStatusCode.Created, (await c.PostAsJsonAsync("/api/workspaces", new { nome = $"Time {i}" })).StatusCode);

        var excedente = await c.PostAsJsonAsync("/api/workspaces", new { nome = "Um a mais" });
        Assert.Equal(HttpStatusCode.BadRequest, excedente.StatusCode);
        Assert.Contains("limite", await excedente.Content.ReadAsStringAsync());
    }
}
