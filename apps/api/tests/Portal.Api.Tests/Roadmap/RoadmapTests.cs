using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;

namespace Portal.Api.Tests.Roadmap;

[Collection("postgres")]
public class RoadmapTests
{
    private const string Rota = "/api/roadmap";

    private readonly PostgresFixture _pg;

    public RoadmapTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario, string nome)
    {
        using var c = api.ClienteCom(usuario);
        var r = await c.PostAsJsonAsync("/api/workspaces", new { nome });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    /// <summary>Semeia um deploy e uma PR no workspace e devolve os ids.</summary>
    private static async Task<(Guid Deploy, Guid Pr)> SemearLigacoes(ApiFactory api, Guid workspace)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var repo = new Repositorio { WorkspaceId = workspace, Nome = "portal" };
        db.Repositorios.Add(repo);
        var deploy = new Deploy
        {
            WorkspaceId = workspace, RepositorioId = repo.Id, Titulo = "Deploy", Ambiente = "producao",
            Status = "agendado", AgendadoPara = DateTimeOffset.UtcNow,
        };
        var pr = new PullRequest
        {
            WorkspaceId = workspace, RepositorioId = repo.Id, Numero = 1, Titulo = "PR", Autor = "ana",
            Estado = "open", Url = "https://exemplo.test/pr/1",
        };
        db.Deploys.Add(deploy);
        db.PullRequests.Add(pr);
        await db.SaveChangesAsync();
        return (deploy.Id, pr.Id);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<JsonElement> Criar(HttpClient c, object corpo)
    {
        using var r = await c.PostAsJsonAsync(Rota, corpo);
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return await Json(r);
    }

    private static async Task AssertErroComMensagem(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        var corpo = await r.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(corpo));
        Assert.Contains("erro", corpo);
    }

    [Fact]
    public async Task Criar_ler_editar_e_apagar_funciona_com_prazo_e_progresso_persistidos()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        var criado = await Criar(c, new { titulo = "Exportar CSV", descricao = "Relatório", status = "ideia", prazo = "2026-12-31", progresso = 30 });
        var id = criado.GetProperty("id").GetGuid();
        Assert.Equal("Exportar CSV", criado.GetProperty("titulo").GetString());

        using var get = await c.GetAsync($"{Rota}/{id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var lido = await Json(get);
        Assert.Equal("Relatório", lido.GetProperty("descricao").GetString());
        Assert.Equal("ideia", lido.GetProperty("status").GetString());
        Assert.StartsWith("2026-12-31", lido.GetProperty("prazo").GetString());
        Assert.Equal(30, lido.GetProperty("progresso").GetInt32());

        using var put = await c.PutAsJsonAsync($"{Rota}/{id}",
            new { titulo = "Exportar PDF", descricao = "Novo", prazo = "2027-01-15", progresso = 80 });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var editado = await Json(await c.GetAsync($"{Rota}/{id}"));
        Assert.Equal("Exportar PDF", editado.GetProperty("titulo").GetString());
        Assert.StartsWith("2027-01-15", editado.GetProperty("prazo").GetString());
        Assert.Equal(80, editado.GetProperty("progresso").GetInt32());

        var lista = await Json(await c.GetAsync(Rota));
        Assert.Equal(1, lista.GetArrayLength());

        using var del = await c.DeleteAsync($"{Rota}/{id}");
        Assert.True(del.IsSuccessStatusCode);
        using var depois = await c.GetAsync($"{Rota}/{id}");
        Assert.Equal(HttpStatusCode.NotFound, depois.StatusCode);
    }

    [Fact]
    public async Task Mover_de_status_persiste_e_status_invalido_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c, new { titulo = "Item", status = "ideia", progresso = 0 })).GetProperty("id").GetGuid();

        foreach (var status in new[] { "planejado", "em_andamento", "entregue" })
        {
            using var patch = await c.PatchAsJsonAsync($"{Rota}/{id}/status", new { status });
            Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
            var lido = await Json(await c.GetAsync($"{Rota}/{id}"));
            Assert.Equal(status, lido.GetProperty("status").GetString());
        }

        using var invalido = await c.PatchAsJsonAsync($"{Rota}/{id}/status", new { status = "abacaxi" });
        await AssertErroComMensagem(invalido);
        var final = await Json(await c.GetAsync($"{Rota}/{id}"));
        Assert.Equal("entregue", final.GetProperty("status").GetString());

        var porStatus = await Json(await c.GetAsync($"{Rota}?status=entregue"));
        Assert.Equal(1, porStatus.GetArrayLength());
        var outroStatus = await Json(await c.GetAsync($"{Rota}?status=ideia"));
        Assert.Equal(0, outroStatus.GetArrayLength());
    }

    [Fact]
    public async Task Item_pode_ser_ligado_a_deploy_e_pr_do_mesmo_workspace_e_a_resposta_traz_as_duas()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var (deploy, pr) = await SemearLigacoes(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);

        var criado = await Criar(c, new { titulo = "Ligado", status = "em_andamento", progresso = 50, deployId = deploy, pullRequestId = pr });

        Assert.Equal(deploy, criado.GetProperty("deployId").GetGuid());
        Assert.Equal(pr, criado.GetProperty("pullRequestId").GetGuid());
        var lido = await Json(await c.GetAsync($"{Rota}/{criado.GetProperty("id").GetGuid()}"));
        Assert.Equal(deploy, lido.GetProperty("deployId").GetGuid());
        Assert.Equal(pr, lido.GetProperty("pullRequestId").GetGuid());
    }

    [Fact]
    public async Task Ligar_a_deploy_ou_pr_de_outro_workspace_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBia = await CriarWorkspace(api, bia, "Da Bia");
        var (deployBia, prBia) = await SemearLigacoes(api, wsBia);
        using var c = api.ClienteCom(ana, workspace: wsAna);
        var id = (await Criar(c, new { titulo = "Item", status = "ideia", progresso = 0 })).GetProperty("id").GetGuid();

        using var comDeploy = await c.PostAsJsonAsync(Rota, new { titulo = "X", status = "ideia", progresso = 0, deployId = deployBia });
        await AssertErroComMensagem(comDeploy);
        using var comPr = await c.PostAsJsonAsync(Rota, new { titulo = "X", status = "ideia", progresso = 0, pullRequestId = prBia });
        await AssertErroComMensagem(comPr);
        using var editando = await c.PutAsJsonAsync($"{Rota}/{id}", new { titulo = "X", progresso = 0, deployId = deployBia });
        await AssertErroComMensagem(editando);

        Assert.Equal(1, (await Json(await c.GetAsync(Rota))).GetArrayLength());
    }

    [Fact]
    public async Task Itens_do_workspace_A_nunca_aparecem_na_listagem_do_workspace_B()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBia = await CriarWorkspace(api, bia, "Da Bia");
        using var cAna = api.ClienteCom(ana, workspace: wsAna);
        using var cBia = api.ClienteCom(bia, workspace: wsBia);
        await Criar(cAna, new { titulo = "Da Ana", status = "ideia", progresso = 0 });

        var listaBia = await Json(await cBia.GetAsync(Rota));
        Assert.Equal(0, listaBia.GetArrayLength());
        var listaAna = await Json(await cAna.GetAsync(Rota));
        Assert.Equal(1, listaAna.GetArrayLength());
    }

    [Fact]
    public async Task Item_de_outro_workspace_devolve_404_em_get_put_patch_e_delete()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBia = await CriarWorkspace(api, bia, "Da Bia");
        using var cAna = api.ClienteCom(ana, workspace: wsAna);
        using var cBia = api.ClienteCom(bia, workspace: wsBia);
        var id = (await Criar(cAna, new { titulo = "Da Ana", status = "ideia", progresso = 10 })).GetProperty("id").GetGuid();

        using var get = await cBia.GetAsync($"{Rota}/{id}");
        using var put = await cBia.PutAsJsonAsync($"{Rota}/{id}", new { titulo = "Invadido", progresso = 99 });
        using var patch = await cBia.PatchAsJsonAsync($"{Rota}/{id}/status", new { status = "entregue" });
        using var del = await cBia.DeleteAsync($"{Rota}/{id}");

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, patch.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);

        var intacto = await Json(await cAna.GetAsync($"{Rota}/{id}"));
        Assert.Equal("Da Ana", intacto.GetProperty("titulo").GetString());
        Assert.Equal("ideia", intacto.GetProperty("status").GetString());
        Assert.Equal(10, intacto.GetProperty("progresso").GetInt32());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("LONGO")]
    public async Task Titulo_vazio_ou_longo_demais_devolve_400_com_mensagem(string titulo)
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        if (titulo == "LONGO") titulo = new string('a', 201);
        var id = (await Criar(c, new { titulo = "Ok", status = "ideia", progresso = 0 })).GetProperty("id").GetGuid();

        using var criar = await c.PostAsJsonAsync(Rota, new { titulo, status = "ideia", progresso = 0 });
        using var editar = await c.PutAsJsonAsync($"{Rota}/{id}", new { titulo, progresso = 0 });

        await AssertErroComMensagem(criar);
        await AssertErroComMensagem(editar);
    }

    [Fact]
    public async Task Titulo_com_200_caracteres_e_aceito()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var r = await c.PostAsJsonAsync(Rota, new { titulo = new string('a', 200), status = "ideia", progresso = 0 });

        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public async Task Progresso_fora_de_0_a_100_devolve_400_com_mensagem(int progresso)
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c, new { titulo = "Ok", status = "ideia", progresso = 0 })).GetProperty("id").GetGuid();

        using var criar = await c.PostAsJsonAsync(Rota, new { titulo = "Item", status = "ideia", progresso });
        using var editar = await c.PutAsJsonAsync($"{Rota}/{id}", new { titulo = "Item", progresso });

        await AssertErroComMensagem(criar);
        await AssertErroComMensagem(editar);
    }

    [Fact]
    public async Task Sem_token_devolve_401_e_sem_X_Workspace_Id_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        await CriarWorkspace(api, usuario, "Time");

        using var anonimo = api.CreateClient();
        using var semToken = await anonimo.GetAsync(Rota);
        Assert.Equal(HttpStatusCode.Unauthorized, semToken.StatusCode);
        using var semTokenPost = await anonimo.PostAsJsonAsync(Rota, new { titulo = "x", status = "ideia", progresso = 0 });
        Assert.Equal(HttpStatusCode.Unauthorized, semTokenPost.StatusCode);

        using var semWorkspace = api.ClienteCom(usuario);
        using var lista = await semWorkspace.GetAsync(Rota);
        Assert.Equal(HttpStatusCode.BadRequest, lista.StatusCode);
        using var criar = await semWorkspace.PostAsJsonAsync(Rota, new { titulo = "x", status = "ideia", progresso = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, criar.StatusCode);
    }
}
