using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Demo;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Demo;

/// <summary>API com a demo ligada (ou desligada) pela configuração Demo:Habilitada.</summary>
public class ApiComDemo : ApiFactory
{
    private readonly bool _habilitada;

    public ApiComDemo(string conexao, bool habilitada = true) : base("Testing", conexao) => _habilitada = habilitada;

    protected override void ConfigurarServicos(IWebHostBuilder builder) =>
        builder.UseSetting("Demo:Habilitada", _habilitada ? "true" : "false");
}

[Collection("postgres")]
public class DemoEndpointsTests
{
    private readonly PostgresFixture _pg;

    public DemoEndpointsTests(PostgresFixture pg) => _pg = pg;

    /// <summary>Banco migrado e semeado; a API da demo sobe depois, já com o banco pronto.</summary>
    private async Task<ApiComDemo> NovaApiAsync()
    {
        var conexao = await _pg.NovoBancoAsync();
        await using (var preparo = new ApiFactory("Testing", conexao))
            await preparo.MigrarAsync();

        var api = new ApiComDemo(conexao);
        using var escopo = api.Services.CreateScope();
        await DemoSeeder.SemearAsync(escopo.ServiceProvider.GetRequiredService<PortalDbContext>());
        return api;
    }

    private static async Task<DateTimeOffset> UmaDataDoDemoAsync(ApiFactory api)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id)
            .OrderBy(d => d.AgendadoPara).Select(d => d.AgendadoPara).FirstAsync();
    }

    private static string Semana(DateTimeOffset d) =>
        $"{ISOWeek.GetYear(d.UtcDateTime)}-W{ISOWeek.GetWeekOfYear(d.UtcDateTime):00}";

    private static async Task<int> ContarDeploysAsync(ApiFactory api)
    {
        using var escopo = api.Services.CreateScope();
        return await escopo.ServiceProvider.GetRequiredService<PortalDbContext>().Deploys.IgnoreQueryFilters().CountAsync();
    }

    [Fact]
    public async Task Get_sem_token_e_sem_workspace_devolve_200_com_so_os_deploys_da_demo()
    {
        await using var api = await NovaApiAsync();
        var data = await UmaDataDoDemoAsync(api);
        var semana = Semana(data);
        using var c = api.CreateClient();

        using var resp = await c.GetAsync($"/api/demo/deploys?semana={semana}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var lista = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(lista.GetArrayLength() >= 1);

        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var idsDemo = (await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id)
            .Select(d => d.Id).ToListAsync()).ToHashSet();
        foreach (var item in lista.EnumerateArray())
            Assert.Contains(item.GetProperty("id").GetGuid(), idsDemo);
    }

    [Fact]
    public async Task Deploys_de_outro_workspace_nunca_aparecem_na_resposta_da_demo()
    {
        await using var api = await NovaApiAsync();
        var data = await UmaDataDoDemoAsync(api);
        var outro = Guid.NewGuid();
        Guid deployDoOutro;
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            db.Workspaces.Add(new Workspace { Id = outro, Nome = "Time real" });
            var repo = new Repositorio { WorkspaceId = outro, Nome = "segredo" };
            db.Repositorios.Add(repo);
            var d = new Deploy
            {
                WorkspaceId = outro, RepositorioId = repo.Id, Titulo = "DEPLOY-SECRETO-DE-OUTRO", Ambiente = "producao",
                Status = "agendado", AgendadoPara = data,
            };
            db.Deploys.Add(d);
            await db.SaveChangesAsync();
            deployDoOutro = d.Id;
        }

        using var c = api.CreateClient();
        // Mesmo mandando o workspace do outro no cabeçalho, a demo só lê o workspace de demonstração.
        c.DefaultRequestHeaders.Add("X-Workspace-Id", outro.ToString());
        using var resp = await c.GetAsync($"/api/demo/deploys?semana={Semana(data)}");

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var corpo = await resp.Content.ReadAsStringAsync();
        Assert.DoesNotContain("DEPLOY-SECRETO-DE-OUTRO", corpo);
        Assert.DoesNotContain(deployDoOutro.ToString(), corpo);
        Assert.DoesNotContain(outro.ToString(), corpo);
    }

    [Theory]
    [InlineData("POST", "/api/demo/deploys")]
    [InlineData("PUT", "/api/demo/deploys")]
    [InlineData("PATCH", "/api/demo/deploys")]
    [InlineData("DELETE", "/api/demo/deploys")]
    [InlineData("PUT", "/api/demo/deploys/00000000-0000-0000-0000-000000000001")]
    [InlineData("PATCH", "/api/demo/deploys/00000000-0000-0000-0000-000000000001")]
    [InlineData("DELETE", "/api/demo/deploys/00000000-0000-0000-0000-000000000001")]
    [InlineData("POST", "/api/demo/qualquer-coisa")]
    public async Task Escrita_em_api_demo_devolve_405_e_nao_muda_o_banco(string metodo, string caminho)
    {
        await using var api = await NovaApiAsync();
        var antes = await ContarDeploysAsync(api);
        using var c = api.CreateClient();
        using var pedido = new HttpRequestMessage(new HttpMethod(metodo), caminho)
        {
            Content = new StringContent(
                "{\"titulo\":\"invasor\",\"ambiente\":\"producao\",\"agendadoPara\":\"2026-04-08T15:00:00Z\"}",
                Encoding.UTF8, "application/json"),
        };

        using var resp = await c.SendAsync(pedido);

        Assert.Equal(HttpStatusCode.MethodNotAllowed, resp.StatusCode);
        Assert.Equal(antes, await ContarDeploysAsync(api));
    }

    [Fact]
    public async Task Com_a_demo_desligada_devolve_404()
    {
        await using var api = new ApiComDemo(ApiFactory.ConexaoSemBanco, habilitada: false);
        using var c = api.CreateClient();

        using var resp = await c.GetAsync("/api/demo/deploys?semana=2026-W15");

        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("?semana=")]
    [InlineData("?semana=2026-W99")]
    [InlineData("?semana=abc")]
    public async Task Semana_invalida_devolve_400_com_mensagem_clara(string consulta)
    {
        await using var api = await NovaApiAsync();
        using var c = api.CreateClient();

        using var resp = await c.GetAsync("/api/demo/deploys" + consulta);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var corpo = await resp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(string.IsNullOrWhiteSpace(corpo.GetProperty("erro").GetString()));
    }
}
