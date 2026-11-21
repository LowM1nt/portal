using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;

namespace Portal.Api.Tests.Perfil;

/// <summary>Duas etapas exigidas pela API (D-013): com mfa_exigido, só token aal2 passa nas rotas autenticadas.</summary>
[Collection("postgres")]
public class MfaTests
{
    private const string Rota = "/api/me/mfa";

    private readonly PostgresFixture _pg;

    public MfaTests(PostgresFixture pg) => _pg = pg;

    private async Task<(ApiFactory Api, string Conexao)> NovaApiAsync()
    {
        var conexao = await _pg.NovoBancoAsync();
        var api = new ApiFactory("Testing", conexao);
        await api.MigrarAsync();
        return (api, conexao);
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<JsonElement> Me(HttpClient c)
    {
        using var r = await c.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await Json(r);
    }

    /// <summary>Cria o workspace pessoal (pelo /api/me) e liga as duas etapas com token aal2. Devolve o workspace.</summary>
    private static async Task<Guid> LigarMfa(ApiFactory api, Guid usuario)
    {
        using var aal2 = api.ClienteCom(usuario, aal: "aal2");
        var ws = (await Me(aal2)).GetProperty("workspaces")[0].GetProperty("id").GetGuid();
        using var r = await aal2.PutAsJsonAsync(Rota, new { exigir = true });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.True((await Json(r)).GetProperty("mfaExigido").GetBoolean());
        return ws;
    }

    private static async Task AssertMfaNecessario(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        var corpo = await Json(r);
        Assert.Equal("mfa_necessario", corpo.GetProperty("codigo").GetString());
        Assert.Equal("Confirme o código de duas etapas pra continuar.", corpo.GetProperty("erro").GetString());
    }

    private static HttpRequestMessage Pedido(string metodo, string rota, object? corpo = null) =>
        new(new HttpMethod(metodo), rota) { Content = corpo is null ? null : JsonContent.Create(corpo) };

    // Rotas de negócio (leitura e escrita) de todas as áreas: deploys, bugs, roadmap, revisões, métricas, integrações,
    // membros/convites, workspaces e perfil.
    private static IEnumerable<HttpRequestMessage> RotasDeNegocio(Guid ws) =>
    [
        Pedido("GET", "/api/deploys"),
        Pedido("POST", "/api/deploys", new { titulo = "x" }),
        Pedido("GET", "/api/repositorios"),
        Pedido("GET", "/api/bugs"),
        Pedido("POST", "/api/bugs", new { titulo = "x" }),
        Pedido("GET", "/api/roadmap"),
        Pedido("GET", "/api/revisoes"),
        Pedido("GET", "/api/metricas"),
        Pedido("GET", "/api/integracoes/github"),
        Pedido("DELETE", "/api/integracoes/github"),
        Pedido("GET", "/api/integracoes/discord"),
        Pedido("PUT", "/api/integracoes/discord", new { token = "x", canalId = "123456789012345678" }),
        Pedido("DELETE", "/api/integracoes/discord"),
        Pedido("GET", "/api/integracoes/ia"),
        Pedido("PUT", "/api/integracoes/ia", new { provedor = "gemini", chave = "x" }),
        Pedido("DELETE", "/api/integracoes/ia"),
        Pedido("GET", "/api/triagem"),
        Pedido("POST", $"/api/triagem/{Guid.NewGuid()}", new { acao = "aprovar" }),
        Pedido("GET", "/api/workspace/membros"),
        Pedido("GET", "/api/workspace/convites"),
        Pedido("POST", "/api/workspace/convites", new { email = "x@y.com", papel = "membro" }),
        Pedido("POST", "/api/convites/aceitar", new { token = "x" }),
        Pedido("POST", "/api/workspaces", new { nome = "Outro" }),
        Pedido("GET", $"/api/workspaces/{ws}"),
        Pedido("PUT", "/api/me/github", new { login = "ana" }),
    ];

    [Fact]
    public async Task Com_mfa_exigido_token_aal1_recebe_403_mfa_necessario_em_todas_as_rotas_de_negocio()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var ana = Guid.NewGuid();
        var ws = await LigarMfa(api, ana);
        using var aal1 = api.ClienteCom(ana, workspace: ws, aal: "aal1");

        foreach (var pedido in RotasDeNegocio(ws))
        {
            using (pedido)
            using (var r = await aal1.SendAsync(pedido))
                await AssertMfaNecessario(r);
        }

        // Nada foi gravado pelas escritas recusadas.
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT count(*) FROM workspaces", c);
        Assert.Equal(1L, (long)(await cmd.ExecuteScalarAsync())!);
    }

    [Fact]
    public async Task Com_mfa_exigido_token_sem_a_claim_aal_tambem_e_recusado()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        var ws = await LigarMfa(api, ana);
        using var semAal = api.ClienteCom(ana, workspace: ws, aal: null);

        using var r = await semAal.GetAsync("/api/bugs");

        await AssertMfaNecessario(r);
    }

    [Fact]
    public async Task Com_mfa_exigido_token_aal2_usa_as_rotas_normalmente()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        var ws = await LigarMfa(api, ana);
        using var aal2 = api.ClienteCom(ana, workspace: ws, aal: "aal2");

        foreach (var rota in new[] { "/api/bugs", "/api/roadmap", "/api/repositorios", "/api/workspace/membros", "/api/integracoes/github", "/api/integracoes/discord", "/api/integracoes/ia", "/api/triagem", $"/api/workspaces/{ws}" })
        {
            using var r = await aal2.GetAsync(rota);
            Assert.True(r.StatusCode == HttpStatusCode.OK, $"{rota}: {r.StatusCode}");
        }

        foreach (var pedido in RotasDeNegocio(ws))
        {
            using (pedido)
            using (var r = await aal2.SendAsync(pedido))
                Assert.DoesNotContain("mfa_necessario", await r.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Get_me_responde_com_aal1_e_informa_mfaExigido()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        using var aal1 = api.ClienteCom(ana, aal: "aal1");
        Assert.False((await Me(aal1)).GetProperty("mfaExigido").GetBoolean());

        await LigarMfa(api, ana);

        var me = await Me(aal1);
        Assert.True(me.GetProperty("mfaExigido").GetBoolean());
        Assert.Equal(1, me.GetProperty("workspaces").GetArrayLength());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Ligar_ou_desligar_com_aal1_devolve_403_e_nao_muda_nada(bool exigir)
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        if (!exigir) await LigarMfa(api, ana);
        using var aal1 = api.ClienteCom(ana, aal: "aal1");

        using var r = await aal1.PutAsJsonAsync(Rota, new { exigir });

        await AssertMfaNecessario(r);
        Assert.Equal(!exigir, (await Me(aal1)).GetProperty("mfaExigido").GetBoolean());
    }

    [Fact]
    public async Task Ligar_e_desligar_com_aal2_vale_na_hora_para_o_aal1()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        using var aal1 = api.ClienteCom(ana, aal: "aal1");
        using var aal2 = api.ClienteCom(ana, aal: "aal2");
        // Passa pelo filtro (e enche o cache com "não exige") antes de ligar.
        using (var antes = await aal1.PostAsJsonAsync("/api/workspaces", new { nome = "Antes" }))
            Assert.Equal(HttpStatusCode.Created, antes.StatusCode);

        using (var ligar = await aal2.PutAsJsonAsync(Rota, new { exigir = true }))
            Assert.Equal(HttpStatusCode.OK, ligar.StatusCode);
        using (var bloqueado = await aal1.PostAsJsonAsync("/api/workspaces", new { nome = "Bloqueado" }))
            await AssertMfaNecessario(bloqueado);

        using (var desligar = await aal2.PutAsJsonAsync(Rota, new { exigir = false }))
        {
            Assert.Equal(HttpStatusCode.OK, desligar.StatusCode);
            Assert.False((await Json(desligar)).GetProperty("mfaExigido").GetBoolean());
        }
        using (var liberado = await aal1.PostAsJsonAsync("/api/workspaces", new { nome = "Depois" }))
            Assert.Equal(HttpStatusCode.Created, liberado.StatusCode);
        Assert.False((await Me(aal1)).GetProperty("mfaExigido").GetBoolean());
    }

    [Fact]
    public async Task Pedido_sem_exigir_devolve_400()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        using var aal2 = api.ClienteCom(Guid.NewGuid(), aal: "aal2");

        using var r = await aal2.PutAsJsonAsync(Rota, new { });

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Sem_token_devolve_401()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        using var c = api.CreateClient();

        using var r = await c.PutAsJsonAsync(Rota, new { exigir = true });

        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
    }

    [Fact]
    public async Task Usuario_sem_mfa_nao_e_afetado_com_aal1()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var bia = Guid.NewGuid();
        using var semWs = api.ClienteCom(bia, aal: "aal1");
        var ws = (await Me(semWs)).GetProperty("workspaces")[0].GetProperty("id").GetGuid();
        using var aal1 = api.ClienteCom(bia, workspace: ws, aal: "aal1");

        foreach (var rota in new[] { "/api/bugs", "/api/roadmap", "/api/workspace/membros", "/api/integracoes/github" })
        {
            using var r = await aal1.GetAsync(rota);
            Assert.True(r.StatusCode == HttpStatusCode.OK, $"{rota}: {r.StatusCode}");
        }
    }

    [Fact]
    public async Task Cada_pessoa_so_muda_o_proprio_mfa()
    {
        var (api, _) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        await LigarMfa(api, ana);
        using var biaAal2 = api.ClienteCom(bia, aal: "aal2");
        using var biaAal1 = api.ClienteCom(bia, aal: "aal1");
        using var anaAal1 = api.ClienteCom(ana, aal: "aal1");

        // A Bia desligar (o dela) não desliga o da Ana; a Bia continua livre com aal1.
        using (var r = await biaAal2.PutAsJsonAsync(Rota, new { exigir = false, usuarioId = ana }))
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.False((await Me(biaAal1)).GetProperty("mfaExigido").GetBoolean());
        using (var r = await biaAal1.PostAsJsonAsync("/api/workspaces", new { nome = "Bia" }))
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);

        Assert.True((await Me(anaAal1)).GetProperty("mfaExigido").GetBoolean());
        using (var r = await anaAal1.PostAsJsonAsync("/api/workspaces", new { nome = "Ana" }))
            await AssertMfaNecessario(r);
    }

    [Fact]
    public async Task Mudanca_direta_no_banco_vale_depois_da_janela_do_cache()
    {
        // Documenta a janela (D-013): o filtro guarda o estado por até 60 s por instância; mudar direto no banco
        // (procedimento de recuperação) não é visto na hora pela instância que já tinha o valor em cache.
        var (api, conexao) = await NovaApiAsync();
        await using var _api = api;
        var ana = Guid.NewGuid();
        var ws = await LigarMfa(api, ana);
        using var aal1 = api.ClienteCom(ana, workspace: ws, aal: "aal1");
        using (var r = await aal1.GetAsync("/api/bugs"))
            await AssertMfaNecessario(r);

        await using (var c = new NpgsqlConnection(conexao))
        {
            await c.OpenAsync();
            await using var cmd = new NpgsqlCommand("UPDATE perfis_usuario SET mfa_exigido = false", c);
            await cmd.ExecuteNonQueryAsync();
        }

        using (var r = await aal1.GetAsync("/api/bugs"))
            await AssertMfaNecessario(r);
        // Uma instância nova (cache vazio) já lê o banco.
        await using var outra = new ApiFactory("Testing", conexao);
        using var outraAal1 = outra.ClienteCom(ana, workspace: ws, aal: "aal1");
        using (var r = await outraAal1.GetAsync("/api/bugs"))
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }
}
