using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Portal.Api.Tests.Perfil;

/// <summary>Login do GitHub de quem está logado (PUT /api/me/github), devolvido no GET /api/me.</summary>
[Collection("postgres")]
public class PerfilTests
{
    private const string Rota = "/api/me/github";

    private readonly PostgresFixture _pg;

    public PerfilTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task<JsonElement> Me(HttpClient c) =>
        await (await c.GetAsync("/api/me")).Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Put_valido_guarda_o_login_sem_arroba_e_o_me_devolve()
    {
        await using var api = await NovaApiAsync();
        using var c = api.ClienteCom(Guid.NewGuid());
        Assert.Equal(JsonValueKind.Null, (await Me(c)).GetProperty("githubLogin").ValueKind);

        using var r = await c.PutAsJsonAsync(Rota, new { login = "  @Ana-Dev " });

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal("Ana-Dev", (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("githubLogin").GetString());
        Assert.Equal("Ana-Dev", (await Me(c)).GetProperty("githubLogin").GetString());

        // Trocar e depois limpar.
        (await c.PutAsJsonAsync(Rota, new { login = "ana2" })).Dispose();
        Assert.Equal("ana2", (await Me(c)).GetProperty("githubLogin").GetString());
        using var limpar = await c.PutAsJsonAsync(Rota, new { login = "" });
        Assert.Equal(HttpStatusCode.OK, limpar.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Me(c)).GetProperty("githubLogin").ValueKind);
    }

    [Theory]
    [InlineData("-ana")]
    [InlineData("ana-")]
    [InlineData("a--b")]
    [InlineData("ana dev")]
    [InlineData("ana/dev")]
    [InlineData("<script>")]
    [InlineData("ana_dev")]
    [InlineData("a234567890123456789012345678901234567890")]
    public async Task Login_mal_formado_devolve_400_e_nao_muda_o_atual(string login)
    {
        await using var api = await NovaApiAsync();
        using var c = api.ClienteCom(Guid.NewGuid());
        (await c.PutAsJsonAsync(Rota, new { login = "ana" })).Dispose();

        using var r = await c.PutAsJsonAsync(Rota, new { login });

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Contains("GitHub", (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("erro").GetString());
        Assert.Equal("ana", (await Me(c)).GetProperty("githubLogin").GetString());
    }

    [Fact]
    public async Task Login_de_39_caracteres_e_aceito()
    {
        await using var api = await NovaApiAsync();
        using var c = api.ClienteCom(Guid.NewGuid());

        using var r = await c.PutAsJsonAsync(Rota, new { login = new string('a', 39) });

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task Cada_pessoa_so_ve_e_muda_o_proprio_login()
    {
        await using var api = await NovaApiAsync();
        using var ana = api.ClienteCom(Guid.NewGuid());
        using var bia = api.ClienteCom(Guid.NewGuid());

        (await ana.PutAsJsonAsync(Rota, new { login = "ana" })).Dispose();
        Assert.Equal(JsonValueKind.Null, (await Me(bia)).GetProperty("githubLogin").ValueKind);

        (await bia.PutAsJsonAsync(Rota, new { login = "bia" })).Dispose();
        Assert.Equal("ana", (await Me(ana)).GetProperty("githubLogin").GetString());
        Assert.Equal("bia", (await Me(bia)).GetProperty("githubLogin").GetString());
    }

    [Fact]
    public async Task Sem_token_devolve_401()
    {
        await using var api = await NovaApiAsync();
        using var c = api.CreateClient();

        using var r = await c.PutAsJsonAsync(Rota, new { login = "ana" });

        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }
}
