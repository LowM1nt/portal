using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;

namespace Portal.Api.Tests;

[Collection("postgres")]
public class DeploysTests
{
    // 2026-W15: segunda 06/04/2026 a domingo 12/04/2026.
    private const string Semana = "2026-W15";

    private readonly PostgresFixture _pg;

    public DeploysTests(PostgresFixture pg) => _pg = pg;

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

    private static async Task<Guid> CriarRepositorio(ApiFactory api, Guid workspace)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var repo = new Repositorio { WorkspaceId = workspace, Nome = "portal" };
        db.Repositorios.Add(repo);
        await db.SaveChangesAsync();
        return repo.Id;
    }

    private static object Corpo(Guid repo, string? titulo = "Deploy da API", string? agendadoPara = "2026-04-08T15:00:00Z",
        string ambiente = "producao") =>
        new { repositorioId = repo, titulo, ambiente, agendadoPara };

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<JsonElement> Criar(HttpClient c, Guid repo, string titulo, string data)
    {
        using var r = await c.PostAsJsonAsync("/api/deploys", Corpo(repo, titulo, data));
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return await Json(r);
    }

    private static async Task<JsonElement> Listar(HttpClient c, string semana = Semana)
    {
        using var r = await c.GetAsync($"/api/deploys?semana={semana}");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await Json(r);
    }

    private static async Task AssertErroEmTexto(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        var corpo = await r.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(corpo));
        Assert.Contains("erro", corpo);
    }

    [Fact]
    public async Task Post_cria_deploy_com_201_e_ele_aparece_na_listagem_da_semana()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var resp = await c.PostAsJsonAsync("/api/deploys", Corpo(repo));

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var criado = await Json(resp);
        Assert.Equal("Deploy da API", criado.GetProperty("titulo").GetString());
        Assert.Equal("agendado", criado.GetProperty("status").GetString());
        var id = criado.GetProperty("id").GetGuid();

        var lista = await Listar(c);
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal(id, lista[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Listagem_devolve_so_a_semana_iso_incluindo_segunda_e_domingo_e_ordenada_por_data()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);

        await Criar(c, repo, "domingo-anterior", "2026-04-05T23:30:00Z");
        await Criar(c, repo, "domingo", "2026-04-12T23:30:00Z");
        await Criar(c, repo, "quarta", "2026-04-08T10:00:00Z");
        await Criar(c, repo, "segunda", "2026-04-06T00:00:00Z");
        await Criar(c, repo, "segunda-seguinte", "2026-04-13T00:00:00Z");

        var lista = await Listar(c);

        var titulos = lista.EnumerateArray().Select(d => d.GetProperty("titulo").GetString()).ToArray();
        Assert.Equal(new[] { "segunda", "quarta", "domingo" }, titulos);
    }

    [Fact]
    public async Task Semana_sem_deploys_devolve_200_com_lista_vazia()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        var lista = await Listar(c, "2026-W30");

        Assert.Equal(JsonValueKind.Array, lista.ValueKind);
        Assert.Equal(0, lista.GetArrayLength());
    }

    [Theory]
    [InlineData("")]
    [InlineData("?semana=")]
    [InlineData("?semana=2026-W99")]
    [InlineData("?semana=2026-15")]
    [InlineData("?semana=abc")]
    public async Task Semana_ausente_ou_invalida_devolve_400_com_mensagem(string consulta)
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var resp = await c.GetAsync("/api/deploys" + consulta);

        await AssertErroEmTexto(resp);
    }

    [Fact]
    public async Task Put_altera_os_campos_e_a_mudanca_aparece_no_get_seguinte()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c, repo, "Antigo", "2026-04-08T15:00:00Z")).GetProperty("id").GetGuid();

        using var put = await c.PutAsJsonAsync($"/api/deploys/{id}",
            Corpo(repo, "Novo título", "2026-04-09T09:00:00Z", "homologacao"));

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var lista = await Listar(c);
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal("Novo título", lista[0].GetProperty("titulo").GetString());
        Assert.Equal("homologacao", lista[0].GetProperty("ambiente").GetString());
        Assert.Equal(DateTimeOffset.Parse("2026-04-09T09:00:00Z"), lista[0].GetProperty("agendadoPara").GetDateTimeOffset());
    }

    [Fact]
    public async Task Delete_cancela_sem_apagar_e_cancelar_de_novo_ou_editar_devolve_erro_claro()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c, repo, "Para cancelar", "2026-04-08T15:00:00Z")).GetProperty("id").GetGuid();

        using var del = await c.DeleteAsync($"/api/deploys/{id}");

        Assert.True(del.IsSuccessStatusCode);
        var lista = await Listar(c);
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal("cancelado", lista[0].GetProperty("status").GetString());

        using var denovo = await c.DeleteAsync($"/api/deploys/{id}");
        Assert.True((int)denovo.StatusCode is >= 400 and < 500);
        Assert.NotEqual(HttpStatusCode.NotFound, denovo.StatusCode);
        Assert.Contains("erro", await denovo.Content.ReadAsStringAsync());

        using var edicao = await c.PutAsJsonAsync($"/api/deploys/{id}", Corpo(repo, "Editado"));
        Assert.True((int)edicao.StatusCode is >= 400 and < 500);
        Assert.NotEqual(HttpStatusCode.NotFound, edicao.StatusCode);
        Assert.Contains("erro", await edicao.Content.ReadAsStringAsync());

        var depois = await Listar(c);
        Assert.Equal("Para cancelar", depois[0].GetProperty("titulo").GetString());
    }

    [Fact]
    public async Task Criar_ou_editar_com_titulo_vazio_longo_ou_data_ausente_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        var repo = await CriarRepositorio(api, ws);
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c, repo, "Válido", "2026-04-08T15:00:00Z")).GetProperty("id").GetGuid();

        var invalidos = new[]
        {
            Corpo(repo, titulo: ""),
            Corpo(repo, titulo: "   "),
            Corpo(repo, titulo: new string('x', 201)),
            Corpo(repo, agendadoPara: null),
        };

        foreach (var corpo in invalidos)
        {
            using var post = await c.PostAsJsonAsync("/api/deploys", corpo);
            await AssertErroEmTexto(post);
            using var put = await c.PutAsJsonAsync($"/api/deploys/{id}", corpo);
            await AssertErroEmTexto(put);
        }

        var lista = await Listar(c);
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal("Válido", lista[0].GetProperty("titulo").GetString());
    }

    [Fact]
    public async Task Usuario_de_outro_workspace_recebe_404_em_get_put_delete_e_a_listagem_nao_vaza()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBeto = await CriarWorkspace(api, beto, "Do Beto");
        var repoAna = await CriarRepositorio(api, wsAna);
        using var cAna = api.ClienteCom(ana, workspace: wsAna);
        using var cBeto = api.ClienteCom(beto, workspace: wsBeto);
        var id = (await Criar(cAna, repoAna, "Segredo da Ana", "2026-04-08T15:00:00Z")).GetProperty("id").GetGuid();

        using var put = await cBeto.PutAsJsonAsync($"/api/deploys/{id}", Corpo(repoAna, "Invadido"));
        using var del = await cBeto.DeleteAsync($"/api/deploys/{id}");
        using var get = await cBeto.GetAsync($"/api/deploys/{id}");

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(0, (await Listar(cBeto)).GetArrayLength());

        var daAna = await Listar(cAna);
        Assert.Equal("Segredo da Ana", daAna[0].GetProperty("titulo").GetString());
        Assert.Equal("agendado", daAna[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Nao_membro_recebe_404_sem_cabecalho_400_e_sem_token_401()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");

        using var intruso = api.ClienteCom(Guid.NewGuid(), workspace: wsAna);
        using var semCabecalho = api.ClienteCom(ana);
        using var semToken = api.CreateClient();
        semToken.DefaultRequestHeaders.Add("X-Workspace-Id", wsAna.ToString());

        using var r404 = await intruso.GetAsync($"/api/deploys?semana={Semana}");
        using var r400 = await semCabecalho.GetAsync($"/api/deploys?semana={Semana}");
        using var r401 = await semToken.GetAsync($"/api/deploys?semana={Semana}");

        Assert.Equal(HttpStatusCode.NotFound, r404.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, r400.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, r401.StatusCode);
    }

    [Fact]
    public async Task Post_com_WorkspaceId_de_outro_workspace_no_corpo_e_ignorado()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var outro = Guid.NewGuid();
        var wsA = await CriarWorkspace(api, usuario, "A");
        var wsB = await CriarWorkspace(api, outro, "B");
        var repoA = await CriarRepositorio(api, wsA);
        using var cA = api.ClienteCom(usuario, workspace: wsA);
        using var cB = api.ClienteCom(outro, workspace: wsB);

        using var resp = await cA.PostAsJsonAsync("/api/deploys", new
        {
            workspaceId = wsB,
            repositorioId = repoA,
            titulo = "Intruso",
            ambiente = "producao",
            agendadoPara = "2026-04-08T15:00:00Z",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        Assert.Equal(1, (await Listar(cA)).GetArrayLength());
        Assert.Equal(0, (await Listar(cB)).GetArrayLength());
    }
}
