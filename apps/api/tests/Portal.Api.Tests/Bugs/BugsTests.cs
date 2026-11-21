using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Portal.Api.Tests.Bugs;

[Collection("postgres")]
public class BugsTests
{
    private readonly PostgresFixture _pg;

    public BugsTests(PostgresFixture pg) => _pg = pg;

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

    private static object Corpo(string? titulo = "Botão não responde", string? relato = "Clico e nada acontece",
        string severidade = "media", string origem = "manual", string? passos = "1. Abrir\n2. Clicar",
        string? esperado = "Abre o modal", string? obtido = "Nada") =>
        new { titulo, relato, passos, esperado, obtido, severidade, origem };

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<JsonElement> Criar(HttpClient c, string titulo = "Bug", object? corpo = null)
    {
        using var r = await c.PostAsJsonAsync("/api/bugs", corpo ?? Corpo(titulo));
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return await Json(r);
    }

    private static async Task<JsonElement> Listar(HttpClient c, string consulta = "")
    {
        using var r = await c.GetAsync("/api/bugs" + consulta);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await Json(r);
    }

    private static Task<HttpResponseMessage> Patch(HttpClient c, Guid id, string status) =>
        c.PatchAsJsonAsync($"/api/bugs/{id}/status", new { status });

    private static async Task AssertErroEmTexto(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        var corpo = await r.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(corpo));
        Assert.Contains("erro", corpo);
    }

    [Fact]
    public async Task Post_valido_devolve_201_e_o_bug_aparece_na_listagem_com_status_a_triar()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var resp = await c.PostAsJsonAsync("/api/bugs", Corpo());

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var criado = await Json(resp);
        var id = criado.GetProperty("id").GetGuid();
        Assert.Equal("Botão não responde", criado.GetProperty("titulo").GetString());
        Assert.Equal("a_triar", criado.GetProperty("status").GetString());

        var lista = await Listar(c);
        Assert.Equal(1, lista.GetArrayLength());
        Assert.Equal(id, lista[0].GetProperty("id").GetGuid());
        Assert.Equal("a_triar", lista[0].GetProperty("status").GetString());
        Assert.Equal("media", lista[0].GetProperty("severidade").GetString());
        Assert.Equal("manual", lista[0].GetProperty("origem").GetString());

        using var get = await c.GetAsync($"/api/bugs/{id}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        var detalhe = await Json(get);
        Assert.Equal("Clico e nada acontece", detalhe.GetProperty("relato").GetString());
        Assert.Equal("Abre o modal", detalhe.GetProperty("esperado").GetString());
        Assert.Equal("Nada", detalhe.GetProperty("obtido").GetString());
    }

    [Fact]
    public async Task Patch_de_status_persiste_e_a_listagem_mostra_o_novo_status()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c)).GetProperty("id").GetGuid();

        using var resp = await Patch(c, id, "em_andamento");

        Assert.True(resp.IsSuccessStatusCode);
        var lista = await Listar(c);
        Assert.Equal("em_andamento", lista[0].GetProperty("status").GetString());
        using var get = await c.GetAsync($"/api/bugs/{id}");
        Assert.Equal("em_andamento", (await Json(get)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Patch_com_status_invalido_devolve_400_com_mensagem()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        var id = (await Criar(c)).GetProperty("id").GetGuid();

        using var resp = await Patch(c, id, "inexistente");

        await AssertErroEmTexto(resp);
    }

    [Fact]
    public async Task Filtro_por_status_devolve_so_os_bugs_daquele_status_e_desconhecido_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);
        await Criar(c, "continua a triar");
        var aberto = (await Criar(c, "vai abrir")).GetProperty("id").GetGuid();
        using (await Patch(c, aberto, "aberto")) { }

        var abertos = await Listar(c, "?status=aberto");
        var aTriar = await Listar(c, "?status=a_triar");
        var resolvidos = await Listar(c, "?status=resolvido");

        Assert.Equal(1, abertos.GetArrayLength());
        Assert.Equal("vai abrir", abertos[0].GetProperty("titulo").GetString());
        Assert.Equal(1, aTriar.GetArrayLength());
        Assert.Equal("continua a triar", aTriar[0].GetProperty("titulo").GetString());
        Assert.Equal(0, resolvidos.GetArrayLength());

        using var desconhecido = await c.GetAsync("/api/bugs?status=xpto");
        await AssertErroEmTexto(desconhecido);
    }

    [Fact]
    public async Task Bug_criado_no_workspace_A_nunca_aparece_na_listagem_do_workspace_B()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsA = await CriarWorkspace(api, ana, "A");
        var wsB = await CriarWorkspace(api, beto, "B");
        using var cA = api.ClienteCom(ana, workspace: wsA);
        using var cB = api.ClienteCom(beto, workspace: wsB);
        await Criar(cA, "Só da A");

        var listaB = await Listar(cB);
        var listaBFiltrada = await Listar(cB, "?status=a_triar");

        Assert.Equal(0, listaB.GetArrayLength());
        Assert.Equal(0, listaBFiltrada.GetArrayLength());
        Assert.Equal(1, (await Listar(cA)).GetArrayLength());
    }

    [Fact]
    public async Task Get_e_patch_do_bug_de_outro_workspace_devolvem_404_e_nao_alteram_nada()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsA = await CriarWorkspace(api, ana, "A");
        var wsB = await CriarWorkspace(api, beto, "B");
        using var cA = api.ClienteCom(ana, workspace: wsA);
        using var cB = api.ClienteCom(beto, workspace: wsB);
        var id = (await Criar(cA, "Da A")).GetProperty("id").GetGuid();

        using var get = await cB.GetAsync($"/api/bugs/{id}");
        using var patch = await Patch(cB, id, "descartado");

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, patch.StatusCode);
        var lista = await Listar(cA);
        Assert.Equal("a_triar", lista[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Id_inexistente_devolve_404()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var get = await c.GetAsync($"/api/bugs/{Guid.NewGuid()}");
        using var patch = await Patch(c, Guid.NewGuid(), "aberto");

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, patch.StatusCode);
    }

    [Fact]
    public async Task Post_com_WorkspaceId_de_outro_workspace_no_corpo_e_ignorado()
    {
        await using var api = await NovaApiAsync();
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsA = await CriarWorkspace(api, ana, "A");
        var wsB = await CriarWorkspace(api, beto, "B");
        using var cA = api.ClienteCom(ana, workspace: wsA);
        using var cB = api.ClienteCom(beto, workspace: wsB);

        using var resp = await cA.PostAsJsonAsync("/api/bugs", new
        {
            workspaceId = wsB,
            titulo = "Intruso",
            relato = "x",
            severidade = "baixa",
            origem = "manual",
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        Assert.Equal(0, (await Listar(cB)).GetArrayLength());
        Assert.Equal(1, (await Listar(cA)).GetArrayLength());
    }

    [Fact]
    public async Task Limites_validos_sao_aceitos_e_enums_validos_passam()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var limite = await c.PostAsJsonAsync("/api/bugs",
            Corpo(new string('t', 200), new string('r', 10000), "critica", "discord",
                new string('p', 4000), new string('e', 4000), new string('o', 4000)));

        Assert.Equal(HttpStatusCode.Created, limite.StatusCode);
    }

    public static IEnumerable<object[]> Invalidos()
    {
        yield return new object[] { "titulo vazio", Corpo(titulo: "") };
        yield return new object[] { "titulo em branco", Corpo(titulo: "   ") };
        yield return new object[] { "titulo nulo", Corpo(titulo: null) };
        yield return new object[] { "titulo 201", Corpo(titulo: new string('t', 201)) };
        yield return new object[] { "relato 10001", Corpo(relato: new string('r', 10001)) };
        yield return new object[] { "passos 4001", Corpo(passos: new string('p', 4001)) };
        yield return new object[] { "esperado 4001", Corpo(esperado: new string('e', 4001)) };
        yield return new object[] { "obtido 4001", Corpo(obtido: new string('o', 4001)) };
        yield return new object[] { "severidade invalida", Corpo(severidade: "gravissima") };
        yield return new object[] { "origem invalida", Corpo(origem: "telegrama") };
    }

    [Theory]
    [MemberData(nameof(Invalidos))]
    public async Task Entrada_invalida_devolve_400_com_mensagem_e_nao_cria_o_bug(string caso, object corpo)
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var c = api.ClienteCom(usuario, workspace: ws);

        using var resp = await c.PostAsJsonAsync("/api/bugs", corpo);

        await AssertErroEmTexto(resp);
        Assert.True((await Listar(c)).GetArrayLength() == 0, caso);
    }

    [Fact]
    public async Task Sem_token_devolve_401_e_sem_cabecalho_de_workspace_devolve_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        using var semToken = api.CreateClient();
        semToken.DefaultRequestHeaders.Add("X-Workspace-Id", ws.ToString());
        using var semCabecalho = api.ClienteCom(usuario);
        var id = Guid.NewGuid();

        Assert.Equal(HttpStatusCode.Unauthorized, (await semToken.GetAsync("/api/bugs")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await semToken.PostAsJsonAsync("/api/bugs", Corpo())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await semToken.GetAsync($"/api/bugs/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Patch(semToken, id, "aberto")).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await semCabecalho.GetAsync("/api/bugs")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await semCabecalho.PostAsJsonAsync("/api/bugs", Corpo())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await semCabecalho.GetAsync($"/api/bugs/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Patch(semCabecalho, id, "aberto")).StatusCode);
    }
}
