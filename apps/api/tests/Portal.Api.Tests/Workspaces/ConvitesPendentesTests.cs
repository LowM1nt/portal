using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Workspaces;

/// <summary>Listar e revogar convites pendentes (só o dono; nunca devolve token nem hash).</summary>
[Collection("postgres")]
public class ConvitesPendentesTests
{
    private const string Convites = "/api/workspace/convites";
    private const string Aceitar = "/api/convites/aceitar";

    private readonly PostgresFixture _pg;

    public ConvitesPendentesTests(PostgresFixture pg) => _pg = pg;

    private async Task<(ApiFactory Api, string Conexao)> NovaApiAsync()
    {
        var conexao = await _pg.NovoBancoAsync();
        var api = new ApiFactory("Testing", conexao);
        await api.MigrarAsync();
        return (api, conexao);
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario, string nome = "Time")
    {
        using var c = api.ClienteCom(usuario, "dono@exemplo.test");
        using var r = await c.PostAsJsonAsync("/api/workspaces", new { nome });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task AdicionarMembro(ApiFactory api, Guid ws, Guid usuario, string papel)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        db.WorkspaceMembros.Add(new WorkspaceMembro { WorkspaceId = ws, UsuarioId = usuario, Papel = papel });
        await db.SaveChangesAsync();
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<(Guid Id, string Token)> Convidar(HttpClient dono, string email, string papel = "membro")
    {
        using var r = await dono.PostAsJsonAsync(Convites, new { email, papel });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var corpo = await Json(r);
        var link = corpo.GetProperty("link").GetString()!;
        return (corpo.GetProperty("id").GetGuid(), link[(link.IndexOf("#token=", StringComparison.Ordinal) + 7)..]);
    }

    private static async Task Executar(string conexao, string sql)
    {
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, c);
        await cmd.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task Dono_lista_so_os_pendentes_sem_token_nem_hash()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        using var c = api.ClienteCom(dono, workspace: ws);
        var (_, tokenBia) = await Convidar(c, "bia@exemplo.test", "admin");
        var (idCaio, _) = await Convidar(c, "caio@exemplo.test");
        var (idDani, _) = await Convidar(c, "dani@exemplo.test");
        // Caio aceita (usado) e o da Dani expira: só o da Bia continua pendente.
        await Executar(conexao, $"UPDATE convites SET usado_em = now() WHERE id = '{idCaio}'");
        await Executar(conexao, $"UPDATE convites SET expira_em = now() - interval '1 minute' WHERE id = '{idDani}'");

        using var r = await c.GetAsync(Convites);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var texto = await r.Content.ReadAsStringAsync();
        Assert.DoesNotContain(tokenBia, texto);
        var lista = JsonDocument.Parse(texto).RootElement;
        Assert.Equal(1, lista.GetArrayLength());
        var bia = lista[0];
        Assert.Equal("bia@exemplo.test", bia.GetProperty("email").GetString());
        Assert.Equal("admin", bia.GetProperty("papel").GetString());
        Assert.True(bia.TryGetProperty("expiraEm", out var _));
        Assert.True(bia.TryGetProperty("criadoEm", out var _));
        foreach (var proibido in new[] { "token", "tokenHash", "link" })
            Assert.False(bia.TryGetProperty(proibido, out var _), $"não devia devolver {proibido}");
    }

    [Theory]
    [InlineData(Papeis.Membro)]
    [InlineData(Papeis.Admin)]
    public async Task Quem_nao_e_dono_recebe_403_ao_listar_e_revogar(string papel)
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var outro = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        await AdicionarMembro(api, ws, outro, papel);
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var (id, _) = await Convidar(cDono, "bia@exemplo.test");
        using var c = api.ClienteCom(outro, workspace: ws);

        using var get = await c.GetAsync(Convites);
        using var del = await c.DeleteAsync($"{Convites}/{id}");

        Assert.Equal(HttpStatusCode.Forbidden, get.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, del.StatusCode);
        Assert.Equal(1, (await Json(await cDono.GetAsync(Convites))).GetArrayLength());
    }

    [Fact]
    public async Task Revogar_apaga_o_convite_e_o_link_nao_aceita_mais()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        using var c = api.ClienteCom(dono, workspace: ws);
        var (id, token) = await Convidar(c, "bia@exemplo.test");

        using var del = await c.DeleteAsync($"{Convites}/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        Assert.Equal(0, (await Json(await c.GetAsync(Convites))).GetArrayLength());

        using var bia = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        using var aceite = await bia.PostAsJsonAsync(Aceitar, new { token });
        Assert.Equal(HttpStatusCode.BadRequest, aceite.StatusCode);
        Assert.Equal(MembrosService.ConviteInvalido, (await Json(aceite)).GetProperty("erro").GetString());

        using var deNovo = await c.DeleteAsync($"{Convites}/{id}");
        Assert.Equal(HttpStatusCode.NotFound, deNovo.StatusCode);
    }

    [Fact]
    public async Task Convite_ja_aceito_nao_e_revogado_404()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono);
        using var c = api.ClienteCom(dono, workspace: ws);
        var (id, token) = await Convidar(c, "bia@exemplo.test");
        using var bia = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        (await bia.PostAsJsonAsync(Aceitar, new { token })).Dispose();

        using var del = await c.DeleteAsync($"{Convites}/{id}");

        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
    }

    [Fact]
    public async Task Dono_de_outro_workspace_nao_ve_nem_revoga_404()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var ana = Guid.NewGuid();
        var beto = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Ana");
        var wsBeto = await CriarWorkspace(api, beto, "Beto");
        using var cAna = api.ClienteCom(ana, workspace: wsAna);
        using var cBeto = api.ClienteCom(beto, workspace: wsBeto);
        var (id, token) = await Convidar(cAna, "bia@exemplo.test");

        Assert.Equal(0, (await Json(await cBeto.GetAsync(Convites))).GetArrayLength());
        using var del = await cBeto.DeleteAsync($"{Convites}/{id}");
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);

        // O convite da Ana continua valendo.
        using var bia = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        using var aceite = await bia.PostAsJsonAsync(Aceitar, new { token });
        Assert.Equal(HttpStatusCode.OK, aceite.StatusCode);
    }
}
