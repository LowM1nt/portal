using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Roadmap;

namespace Portal.Api.Tests.Metricas;

/// <summary>API com o relógio parado num instante conhecido (as métricas usam TimeProvider).</summary>
public class ApiComRelogio : ApiFactory
{
    private readonly TimeProvider _relogio;

    public ApiComRelogio(string conexao, DateTimeOffset agora) : base("Testing", conexao) => _relogio = new RelogioParado(agora);

    protected override void ConfigurarServicos(IWebHostBuilder builder) =>
        builder.ConfigureServices(s => s.AddSingleton(_relogio));

    private sealed class RelogioParado(DateTimeOffset agora) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => agora;
    }
}

[Collection("postgres")]
public class MetricasTests
{
    private const string Rota = "/api/metricas";
    private static readonly DateTimeOffset Agora = new(2026, 11, 20, 12, 0, 0, TimeSpan.Zero);

    private readonly PostgresFixture _pg;

    public MetricasTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiComRelogio(await _pg.NovoBancoAsync(), Agora);
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario, string nome)
    {
        using var c = api.ClienteCom(usuario);
        using var r = await c.PostAsJsonAsync("/api/workspaces", new { nome });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static DateTimeOffset Dia(double diasAtras) => Agora - TimeSpan.FromDays(diasAtras);

    /// <summary>Deploy no workspace; criadoHorasAntes = horas entre o registro e o deploy (lead time sem PR ligada).</summary>
    private static Deploy NovoDeploy(Guid ws, Repositorio repo, string status, double diasAtras, double criadoHorasAntes = 0) => new()
    {
        WorkspaceId = ws, RepositorioId = repo.Id, Titulo = "Deploy", Ambiente = "producao", Status = status,
        AgendadoPara = Dia(diasAtras), CriadoEm = Dia(diasAtras) - TimeSpan.FromHours(criadoHorasAntes),
    };

    /// <summary>
    /// Cenário com valores conhecidos (período de 4 semanas = 28 dias até <see cref="Agora"/>).
    /// Atual: 4 sucessos, 3 falhas (uma sem recuperação), lead times 120/24/12/6 h, uma recuperação de 48 h.
    /// Anterior: 2 sucessos, 1 falha, lead times 24/48 h, recuperação de 24 h.
    /// </summary>
    private static async Task SemearCenario(ApiFactory api, Guid ws)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var a = new Repositorio { WorkspaceId = ws, Nome = "api" };
        var b = new Repositorio { WorkspaceId = ws, Nome = "web" };
        db.Repositorios.AddRange(a, b);

        // Período atual.
        var s1 = NovoDeploy(ws, a, "concluido", 20, criadoHorasAntes: 1); // lead vem da PR: 5 dias = 120 h
        var pr = new PullRequest
        {
            WorkspaceId = ws, RepositorioId = a.Id, Numero = 1, Titulo = "PR", Autor = "ana", Estado = "closed",
            Url = "https://exemplo.test/pr/1", CriadoEm = Dia(25),
        };
        var prMaisNova = new PullRequest
        {
            WorkspaceId = ws, RepositorioId = a.Id, Numero = 2, Titulo = "PR 2", Autor = "ana", Estado = "closed",
            Url = "https://exemplo.test/pr/2", CriadoEm = Dia(21),
        };
        db.PullRequests.AddRange(pr, prMaisNova);
        db.ItensRoadmap.AddRange(
            new ItemRoadmap { WorkspaceId = ws, Titulo = "Item", DeployId = s1.Id, PullRequestId = prMaisNova.Id },
            new ItemRoadmap { WorkspaceId = ws, Titulo = "Item", DeployId = s1.Id, PullRequestId = pr.Id });
        db.Deploys.AddRange(
            s1,
            NovoDeploy(ws, a, "falhou", 10),
            NovoDeploy(ws, a, "falhou", 9), // mesmo incidente
            NovoDeploy(ws, a, "concluido", 8, criadoHorasAntes: 24), // recupera: 48 h desde a 1ª falha
            NovoDeploy(ws, a, "concluido", 1, criadoHorasAntes: 12),
            NovoDeploy(ws, a, "cancelado", 5),
            NovoDeploy(ws, a, "agendado", 3),
            NovoDeploy(ws, b, "concluido", 7, criadoHorasAntes: 6),
            NovoDeploy(ws, b, "falhou", 6), // sem recuperação ainda
            // Período anterior.
            NovoDeploy(ws, a, "concluido", 40, criadoHorasAntes: 24),
            NovoDeploy(ws, a, "falhou", 35),
            NovoDeploy(ws, a, "concluido", 34, criadoHorasAntes: 48)); // recupera: 24 h
        await db.SaveChangesAsync();
    }

    private static void AssertMetrica(JsonElement m, double? valor, double? anterior, double? variacao)
    {
        static double? Ler(JsonElement e) => e.ValueKind == JsonValueKind.Null ? null : e.GetDouble();
        Assert.Equal(valor, Ler(m.GetProperty("valor")));
        Assert.Equal(anterior, Ler(m.GetProperty("anterior")));
        Assert.Equal(variacao, Ler(m.GetProperty("variacao")));
    }

    private static double? Num(JsonElement e, string campo) =>
        e.GetProperty(campo).ValueKind == JsonValueKind.Null ? null : e.GetProperty(campo).GetDouble();

    [Fact]
    public async Task Com_dados_controlados_as_quatro_metricas_e_a_serie_tem_os_valores_exatos()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await SemearCenario(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var r = await c.GetAsync($"{Rota}?semanas=4");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var m = await r.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4, m.GetProperty("semanas").GetInt32());
        Assert.Equal(Agora, m.GetProperty("fim").GetDateTimeOffset());
        Assert.Equal(Dia(28), m.GetProperty("inicio").GetDateTimeOffset());

        AssertMetrica(m.GetProperty("deploysPorDia"), 0.14, 0.07, 100.0); // 4/28 e 2/28
        AssertMetrica(m.GetProperty("tempoAteDeployHoras"), 18, 36, -50.0); // medianas de 6,12,24,120 e de 24,48
        AssertMetrica(m.GetProperty("taxaDeFalha"), 42.9, 33.3, 28.8); // 3/7 e 1/3, em %
        AssertMetrica(m.GetProperty("tempoParaRecuperarHoras"), 48, 24, 100.0);

        var series = m.GetProperty("series");
        Assert.Equal(4, series.GetArrayLength());
        Assert.Equal(Dia(28), series[0].GetProperty("inicio").GetDateTimeOffset());
        Assert.Equal(Dia(21), series[0].GetProperty("fim").GetDateTimeOffset());

        // Semana 1 (28 a 21 dias atrás): nada.
        Assert.Equal(0, series[0].GetProperty("deploys").GetInt32());
        Assert.Equal(0, series[0].GetProperty("falhas").GetInt32());
        Assert.Null(Num(series[0], "taxaDeFalha"));
        Assert.Null(Num(series[0], "tempoAteDeployHoras"));
        Assert.Null(Num(series[0], "tempoParaRecuperarHoras"));
        // Semana 2: o deploy ligado às PRs (a mais antiga define o início).
        Assert.Equal(1, series[1].GetProperty("deploys").GetInt32());
        Assert.Equal(0.0, Num(series[1], "taxaDeFalha"));
        Assert.Equal(120.0, Num(series[1], "tempoAteDeployHoras"));
        // Semana 3: duas falhas seguidas e a recuperação.
        Assert.Equal(1, series[2].GetProperty("deploys").GetInt32());
        Assert.Equal(2, series[2].GetProperty("falhas").GetInt32());
        Assert.Equal(66.7, Num(series[2], "taxaDeFalha"));
        Assert.Equal(24.0, Num(series[2], "tempoAteDeployHoras"));
        Assert.Equal(48.0, Num(series[2], "tempoParaRecuperarHoras"));
        // Semana 4: dois sucessos e uma falha ainda aberta (não vira amostra de recuperação).
        Assert.Equal(2, series[3].GetProperty("deploys").GetInt32());
        Assert.Equal(1, series[3].GetProperty("falhas").GetInt32());
        Assert.Equal(33.3, Num(series[3], "taxaDeFalha"));
        Assert.Equal(9.0, Num(series[3], "tempoAteDeployHoras"));
        Assert.Null(Num(series[3], "tempoParaRecuperarHoras"));
    }

    [Fact]
    public async Task Sem_dados_as_metricas_vem_nulas_e_a_frequencia_zero()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Vazio");
        using (var escopo = api.Services.CreateScope())
        {
            // Só deploys agendados e cancelados: não contam como acontecidos.
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var repo = new Repositorio { WorkspaceId = ws, Nome = "api" };
            db.Repositorios.Add(repo);
            db.Deploys.AddRange(NovoDeploy(ws, repo, "agendado", 2), NovoDeploy(ws, repo, "cancelado", 3));
            await db.SaveChangesAsync();
        }
        using var c = api.ClienteCom(usuario, workspace: ws);

        var m = await (await c.GetAsync(Rota)).Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(12, m.GetProperty("semanas").GetInt32());
        AssertMetrica(m.GetProperty("deploysPorDia"), 0, 0, null);
        AssertMetrica(m.GetProperty("tempoAteDeployHoras"), null, null, null);
        AssertMetrica(m.GetProperty("taxaDeFalha"), null, null, null);
        AssertMetrica(m.GetProperty("tempoParaRecuperarHoras"), null, null, null);
        var series = m.GetProperty("series");
        Assert.Equal(12, series.GetArrayLength());
        Assert.All(series.EnumerateArray(), s =>
        {
            Assert.Equal(0, s.GetProperty("deploys").GetInt32());
            Assert.Null(Num(s, "taxaDeFalha"));
            Assert.Null(Num(s, "tempoAteDeployHoras"));
            Assert.Null(Num(s, "tempoParaRecuperarHoras"));
        });
    }

    [Fact]
    public async Task Sem_periodo_anterior_a_variacao_vem_nula()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Novo");
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var repo = new Repositorio { WorkspaceId = ws, Nome = "api" };
            db.Repositorios.Add(repo);
            db.Deploys.AddRange(NovoDeploy(ws, repo, "falhou", 3), NovoDeploy(ws, repo, "concluido", 2, criadoHorasAntes: 10));
            await db.SaveChangesAsync();
        }
        using var c = api.ClienteCom(usuario, workspace: ws);

        var m = await (await c.GetAsync($"{Rota}?semanas=4")).Content.ReadFromJsonAsync<JsonElement>();

        AssertMetrica(m.GetProperty("deploysPorDia"), 0.04, 0, null);
        AssertMetrica(m.GetProperty("tempoAteDeployHoras"), 10, null, null);
        AssertMetrica(m.GetProperty("taxaDeFalha"), 50, null, null);
        AssertMetrica(m.GetProperty("tempoParaRecuperarHoras"), 24, null, null);
    }

    [Fact]
    public async Task Metricas_de_um_workspace_nao_enxergam_deploys_de_outro()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBia = await CriarWorkspace(api, bia, "Da Bia");
        await SemearCenario(api, wsAna);
        using var cBia = api.ClienteCom(bia, workspace: wsBia);
        using var cAna = api.ClienteCom(ana, workspace: wsAna);

        var daBia = await (await cBia.GetAsync($"{Rota}?semanas=4")).Content.ReadFromJsonAsync<JsonElement>();
        AssertMetrica(daBia.GetProperty("deploysPorDia"), 0, 0, null);
        AssertMetrica(daBia.GetProperty("taxaDeFalha"), null, null, null);
        AssertMetrica(daBia.GetProperty("tempoAteDeployHoras"), null, null, null);
        AssertMetrica(daBia.GetProperty("tempoParaRecuperarHoras"), null, null, null);

        var daAna = await (await cAna.GetAsync($"{Rota}?semanas=4")).Content.ReadFromJsonAsync<JsonElement>();
        AssertMetrica(daAna.GetProperty("deploysPorDia"), 0.14, 0.07, 100.0);

        // Bia com o cabeçalho do workspace da Ana: não é membro.
        using var cBiaNaAna = api.ClienteCom(bia, workspace: wsAna);
        Assert.Equal(HttpStatusCode.NotFound, (await cBiaNaAna.GetAsync(Rota)).StatusCode);
    }

    [Theory]
    [InlineData("1")]
    [InlineData("8")]
    [InlineData("abc")]
    public async Task Semanas_fora_de_4_ou_12_devolve_400_com_mensagem(string semanas)
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var r = await c.GetAsync($"{Rota}?semanas={semanas}");

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("semanas", (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("erro").GetString());
    }

    [Fact]
    public async Task Sem_token_devolve_401_e_sem_X_Workspace_Id_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        await CriarWorkspace(api, usuario, "Time");

        using var anonimo = api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync(Rota)).StatusCode);
        using var semWorkspace = api.ClienteCom(usuario);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWorkspace.GetAsync(Rota)).StatusCode);
    }
}
