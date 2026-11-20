using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Portal.Api.Tests;

[Collection("postgres")]
public class WorkspacesTests
{
    private readonly PostgresFixture _pg;

    public WorkspacesTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>());

    [Fact]
    public async Task Primeiro_me_cria_workspace_pessoal_como_dono_e_o_segundo_nao_duplica()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        using var client = api.ClienteCom(usuario, "ana@exemplo.com");

        using var primeiro = await client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, primeiro.StatusCode);
        var corpo1 = await Json(primeiro);
        Assert.Equal(usuario, corpo1.GetProperty("usuarioId").GetGuid());
        Assert.Equal("ana@exemplo.com", corpo1.GetProperty("email").GetString());
        var lista1 = corpo1.GetProperty("workspaces");
        Assert.Equal(1, lista1.GetArrayLength());
        Assert.Equal("Meu workspace", lista1[0].GetProperty("nome").GetString());
        Assert.Equal("dono", lista1[0].GetProperty("papel").GetString());

        using var segundo = await client.GetAsync("/api/me");
        var lista2 = (await Json(segundo)).GetProperty("workspaces");
        Assert.Equal(1, lista2.GetArrayLength());
        Assert.Equal(lista1[0].GetProperty("id").GetGuid(), lista2[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Post_workspaces_cria_com_papel_dono_e_aparece_no_me()
    {
        await using var api = await NovaApiAsync();
        using var client = api.ClienteCom(Guid.NewGuid(), "ana@exemplo.com");

        using var criado = await client.PostAsJsonAsync("/api/workspaces", new { nome = "Time de dev" });
        Assert.Equal(HttpStatusCode.Created, criado.StatusCode);
        var corpo = await Json(criado);
        Assert.Equal("Time de dev", corpo.GetProperty("nome").GetString());
        Assert.Equal("dono", corpo.GetProperty("papel").GetString());
        var id = corpo.GetProperty("id").GetGuid();

        var workspaces = (await Json(await client.GetAsync("/api/me"))).GetProperty("workspaces");
        Assert.Contains(workspaces.EnumerateArray(), w => w.GetProperty("id").GetGuid() == id);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Post_workspaces_com_nome_vazio_devolve_400(string nome)
    {
        await using var api = await NovaApiAsync();
        using var client = api.ClienteCom(Guid.NewGuid());

        using var resp = await client.PostAsJsonAsync("/api/workspaces", new { nome });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Post_workspaces_com_nome_de_101_caracteres_devolve_400()
    {
        await using var api = await NovaApiAsync();
        using var client = api.ClienteCom(Guid.NewGuid());

        using var resp = await client.PostAsJsonAsync("/api/workspaces", new { nome = new string('a', 101) });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Post_workspaces_com_nome_de_100_caracteres_devolve_201()
    {
        await using var api = await NovaApiAsync();
        using var client = api.ClienteCom(Guid.NewGuid());

        using var resp = await client.PostAsJsonAsync("/api/workspaces", new { nome = new string('a', 100) });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
    }

    [Fact]
    public async Task Dois_usuarios_so_enxergam_o_proprio_e_o_alheio_devolve_404_igual_a_inexistente()
    {
        await using var api = await NovaApiAsync();
        using var ana = api.ClienteCom(Guid.NewGuid(), "ana@exemplo.com");
        using var beto = api.ClienteCom(Guid.NewGuid(), "beto@exemplo.com");

        var wsAna = (await Json(await ana.GetAsync("/api/me"))).GetProperty("workspaces")[0].GetProperty("id").GetGuid();
        var wsBeto = (await Json(await beto.GetAsync("/api/me"))).GetProperty("workspaces")[0].GetProperty("id").GetGuid();
        Assert.NotEqual(wsAna, wsBeto);

        var listaAna = (await Json(await ana.GetAsync("/api/me"))).GetProperty("workspaces");
        Assert.Equal(1, listaAna.GetArrayLength());
        Assert.Equal(wsAna, listaAna[0].GetProperty("id").GetGuid());

        using var proprio = await ana.GetAsync($"/api/workspaces/{wsAna}");
        Assert.Equal(HttpStatusCode.OK, proprio.StatusCode);
        Assert.Equal("dono", (await Json(proprio)).GetProperty("papel").GetString());

        using var alheio = await ana.GetAsync($"/api/workspaces/{wsBeto}");
        using var inexistente = await ana.GetAsync($"/api/workspaces/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, alheio.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.StatusCode);
    }
}
