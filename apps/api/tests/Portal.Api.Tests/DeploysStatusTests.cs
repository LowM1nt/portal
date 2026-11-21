using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests;

/// <summary>Marcar como foi o deploy (concluido/falhou/agendado) e listar os repositórios do workspace.</summary>
[Collection("postgres")]
public class DeploysStatusTests
{
    private readonly PostgresFixture _pg;

    public DeploysStatusTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario, string nome = "Time")
    {
        using var c = api.ClienteCom(usuario);
        using var r = await c.PostAsJsonAsync("/api/workspaces", new { nome });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task<Guid> CriarRepositorio(ApiFactory api, Guid workspace, string nome = "acme/portal")
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var repo = new Repositorio { WorkspaceId = workspace, Nome = nome };
        db.Repositorios.Add(repo);
        await db.SaveChangesAsync();
        return repo.Id;
    }

    private static async Task AdicionarMembro(ApiFactory api, Guid ws, Guid usuario, string papel)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        db.WorkspaceMembros.Add(new WorkspaceMembro { WorkspaceId = ws, UsuarioId = usuario, Papel = papel });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> CriarDeploy(HttpClient c, Guid repo, DateTimeOffset quando)
    {
        using var r = await c.PostAsJsonAsync("/api/deploys",
            new { repositorioId = repo, titulo = "Deploy da API", ambiente = "producao", agendadoPara = quando });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static Task<HttpResponseMessage> Marcar(HttpClient c, Guid id, string? status) =>
        c.PatchAsJsonAsync($"/api/deploys/{id}/status", new { status });

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Membro_marca_concluido_falhou_e_volta_para_agendado_e_as_metricas_contam()
    {
        await using var api = await NovaApiAsync();
        var dono = Guid.NewGuid();
        var membro = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        await AdicionarMembro(api, ws, membro, Papeis.Membro);
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(membro, workspace: ws);
        var id = await CriarDeploy(c, repo, DateTimeOffset.UtcNow.AddDays(-2));

        using (var r = await Marcar(c, id, "concluido"))
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Assert.Equal("concluido", (await Json(r)).GetProperty("status").GetString());
        }
        var metricas = await Json(await c.GetAsync("/api/metricas?semanas=4"));
        Assert.True(metricas.GetProperty("deploysPorDia").GetProperty("valor").GetDouble() > 0);
        Assert.Equal(0, metricas.GetProperty("taxaDeFalha").GetProperty("valor").GetDouble());

        using (var r = await Marcar(c, id, " FALHOU "))
            Assert.Equal("falhou", (await Json(r)).GetProperty("status").GetString());
        metricas = await Json(await c.GetAsync("/api/metricas?semanas=4"));
        Assert.Equal(100, metricas.GetProperty("taxaDeFalha").GetProperty("valor").GetDouble());

        using (var r = await Marcar(c, id, "agendado"))
            Assert.Equal("agendado", (await Json(r)).GetProperty("status").GetString());
        metricas = await Json(await c.GetAsync("/api/metricas?semanas=4"));
        Assert.Equal(JsonValueKind.Null, metricas.GetProperty("taxaDeFalha").GetProperty("valor").ValueKind);
    }

    [Theory]
    [InlineData("cancelado")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("pronto")]
    public async Task Status_invalido_devolve_400(string? status)
    {
        await using var api = await NovaApiAsync();
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(dono, workspace: ws);
        var id = await CriarDeploy(c, repo, DateTimeOffset.UtcNow);

        using var r = await Marcar(c, id, status);

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await Json(r)).GetProperty("erro").GetString()));
    }

    [Fact]
    public async Task Deploy_cancelado_nao_muda_de_status_409()
    {
        await using var api = await NovaApiAsync();
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(dono, workspace: ws);
        var id = await CriarDeploy(c, repo, DateTimeOffset.UtcNow);
        (await c.DeleteAsync($"/api/deploys/{id}")).Dispose();

        using var r = await Marcar(c, id, "concluido");

        Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
    }

    [Fact]
    public async Task Deploy_de_outro_workspace_devolve_404_e_nao_muda()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana);
        var wsBeto = await CriarWorkspace(api, beto);
        var repo = await CriarRepositorio(api, wsAna);
        using var cAna = api.ClienteCom(ana, workspace: wsAna);
        using var cBeto = api.ClienteCom(beto, workspace: wsBeto);
        var id = await CriarDeploy(cAna, repo, DateTimeOffset.UtcNow);

        using var r = await Marcar(cBeto, id, "falhou");

        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        Assert.Equal("agendado", (await Json(await cAna.GetAsync($"/api/deploys/{id}"))).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Quem_nao_e_membro_recebe_404_e_sem_token_401()
    {
        await using var api = await NovaApiAsync();
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(dono, workspace: ws);
        var id = await CriarDeploy(c, repo, DateTimeOffset.UtcNow);

        using var estranho = api.ClienteCom(Guid.NewGuid(), workspace: ws);
        using var r404 = await Marcar(estranho, id, "concluido");
        using var anonimo = api.CreateClient();
        using var r401 = await Marcar(anonimo, id, "concluido");

        Assert.Equal(HttpStatusCode.NotFound, r404.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, r401.StatusCode);
    }

    [Fact]
    public async Task Repositorios_lista_so_os_do_workspace_em_ordem_de_nome()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana);
        var wsBeto = await CriarWorkspace(api, beto);
        await CriarRepositorio(api, wsAna, "acme/web");
        var api1 = await CriarRepositorio(api, wsAna, "acme/api");
        await CriarRepositorio(api, wsBeto, "beto/segredo");
        using var c = api.ClienteCom(ana, workspace: wsAna);

        var lista = await Json(await c.GetAsync("/api/repositorios"));

        Assert.Equal(new[] { "acme/api", "acme/web" }, lista.EnumerateArray().Select(r => r.GetProperty("nome").GetString()).ToArray());
        Assert.Equal(api1, lista[0].GetProperty("id").GetGuid());
        using var semWs = api.ClienteCom(ana);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWs.GetAsync("/api/repositorios")).StatusCode);
    }
}
