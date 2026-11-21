using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Workspaces;

[Collection("postgres")]
public class MembrosTests
{
    private const string Membros = "/api/workspace/membros";
    private const string Convites = "/api/workspace/convites";
    private const string Aceitar = "/api/convites/aceitar";

    private readonly PostgresFixture _pg;

    public MembrosTests(PostgresFixture pg) => _pg = pg;

    private async Task<(ApiFactory Api, string Conexao)> NovaApiAsync()
    {
        var conexao = await _pg.NovoBancoAsync();
        var api = new ApiFactory("Testing", conexao);
        await api.MigrarAsync();
        return (api, conexao);
    }

    private static async Task<Guid> CriarWorkspace(ApiFactory api, Guid usuario, string nome, string? email = null)
    {
        using var c = api.ClienteCom(usuario, email);
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

    private static string TokenDoLink(string link) => link[(link.IndexOf("#token=", StringComparison.Ordinal) + 7)..];

    private static async Task<string> Convidar(HttpClient dono, string email, string papel = "membro")
    {
        using var r = await dono.PostAsJsonAsync(Convites, new { email, papel });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return TokenDoLink((await Json(r)).GetProperty("link").GetString()!);
    }

    private static async Task<T> Escalar<T>(string conexao, string sql)
    {
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, c);
        return (T)(await cmd.ExecuteScalarAsync())!;
    }

    private static async Task Executar(string conexao, string sql)
    {
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, c);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task AssertConviteInvalido(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.Equal(MembrosService.ConviteInvalido, (await Json(r)).GetProperty("erro").GetString());
    }

    [Fact]
    public async Task Convite_guarda_so_o_hash_do_token_e_devolve_o_link_uma_vez()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time", "dono@exemplo.test");
        using var c = api.ClienteCom(dono, workspace: ws);

        using var r = await c.PostAsJsonAsync(Convites, new { email = "  Bia@Exemplo.TEST ", papel = "admin" });

        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        var corpo = await Json(r);
        Assert.Equal("bia@exemplo.test", corpo.GetProperty("email").GetString());
        Assert.Equal("admin", corpo.GetProperty("papel").GetString());
        var link = corpo.GetProperty("link").GetString()!;
        Assert.StartsWith("http://localhost:5173/convite#token=", link);
        var token = TokenDoLink(link);
        var bytes = WebEncoders.Base64UrlDecode(token);
        Assert.Equal(32, bytes.Length);

        var hashNoBanco = await Escalar<byte[]>(conexao, "SELECT token_hash FROM convites");
        Assert.Equal(SHA256.HashData(bytes), hashNoBanco);
        var linha = await Escalar<string>(conexao, "SELECT row_to_json(c)::text FROM convites c");
        Assert.DoesNotContain(token, linha);
        Assert.DoesNotContain(Convert.ToBase64String(bytes), linha);
        var validade = await Escalar<double>(conexao, "SELECT extract(epoch FROM expira_em - criado_em)::float8 FROM convites");
        Assert.Equal(TimeSpan.FromDays(7).TotalSeconds, validade);
    }

    [Fact]
    public async Task Aceitar_cria_o_vinculo_com_o_papel_do_convite_e_o_token_so_vale_uma_vez()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time", "dono@exemplo.test");
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var token = await Convidar(cDono, "bia@exemplo.test", "admin");

        // E-mail do JWT com outra caixa: a comparação não diferencia maiúsculas.
        using var cBia = api.ClienteCom(bia, "BIA@Exemplo.test");
        using var aceite = await cBia.PostAsJsonAsync(Aceitar, new { token });

        Assert.Equal(HttpStatusCode.OK, aceite.StatusCode);
        var aceito = await Json(aceite);
        Assert.Equal(ws, aceito.GetProperty("workspaceId").GetGuid());
        Assert.Equal("Time", aceito.GetProperty("nome").GetString());
        Assert.Equal("admin", aceito.GetProperty("papel").GetString());

        var membros = await Json(await cDono.GetAsync(Membros));
        Assert.Equal(2, membros.GetArrayLength());
        Assert.Equal("dono", membros[0].GetProperty("papel").GetString());
        Assert.Equal("dono@exemplo.test", membros[0].GetProperty("email").GetString());
        Assert.True(membros[0].GetProperty("voce").GetBoolean());
        Assert.Equal(bia, membros[1].GetProperty("usuarioId").GetGuid());
        Assert.Equal("admin", membros[1].GetProperty("papel").GetString());
        Assert.Equal("bia@exemplo.test", membros[1].GetProperty("email").GetString());

        // Agora a Bia enxerga o workspace.
        using var cBiaNoWs = api.ClienteCom(bia, "bia@exemplo.test", ws);
        Assert.Equal(HttpStatusCode.OK, (await cBiaNoWs.GetAsync(Membros)).StatusCode);

        // Uso único: o mesmo token de novo (até por outra pessoa com o mesmo e-mail) é recusado com mensagem neutra.
        using var outra = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        await AssertConviteInvalido(await outra.PostAsJsonAsync(Aceitar, new { token }));
    }

    [Fact]
    public async Task Convite_expirado_e_recusado_com_mensagem_neutra()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var token = await Convidar(cDono, "bia@exemplo.test");
        await Executar(conexao, "UPDATE convites SET expira_em = now() - interval '1 minute'");

        using var cBia = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        await AssertConviteInvalido(await cBia.PostAsJsonAsync(Aceitar, new { token }));
        Assert.Equal(1, (await Json(await cDono.GetAsync(Membros))).GetArrayLength());
    }

    [Fact]
    public async Task Email_diferente_do_convite_e_recusado_e_o_convite_continua_valendo_para_o_dono_do_email()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var token = await Convidar(cDono, "bia@exemplo.test");

        using var intruso = api.ClienteCom(Guid.NewGuid(), "intruso@exemplo.test");
        await AssertConviteInvalido(await intruso.PostAsJsonAsync(Aceitar, new { token }));
        using var semEmail = api.ClienteCom(Guid.NewGuid());
        await AssertConviteInvalido(await semEmail.PostAsJsonAsync(Aceitar, new { token }));

        using var bia = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");
        Assert.Equal(HttpStatusCode.OK, (await bia.PostAsJsonAsync(Aceitar, new { token })).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("curto")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")] // formato certo, mas não existe
    [InlineData("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")]
    public async Task Token_malformado_ou_inexistente_e_recusado_com_a_mesma_mensagem(string token)
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        using var c = api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test");

        await AssertConviteInvalido(await c.PostAsJsonAsync(Aceitar, new { token }));
    }

    [Fact]
    public async Task Aceites_simultaneos_do_mesmo_convite_so_um_vence()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var token = await Convidar(cDono, "bia@exemplo.test");

        // Dez contas com o mesmo e-mail disputam o mesmo token ao mesmo tempo.
        var clientes = Enumerable.Range(0, 10).Select(_ => api.ClienteCom(Guid.NewGuid(), "bia@exemplo.test")).ToList();
        var respostas = await Task.WhenAll(clientes.Select(c => c.PostAsJsonAsync(Aceitar, new { token })));

        Assert.Equal(1, respostas.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(9, respostas.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
        Assert.Equal(2L, await Escalar<long>(conexao, $"SELECT count(*) FROM workspace_membros WHERE workspace_id = '{ws}'"));
        foreach (var c in clientes) c.Dispose();
        foreach (var r in respostas) r.Dispose();
    }

    [Fact]
    public async Task Quem_ja_e_membro_recebe_409_e_o_convite_nao_e_gasto()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        await AdicionarMembro(api, ws, bia, Papeis.Membro);
        using var cDono = api.ClienteCom(dono, workspace: ws);
        var token = await Convidar(cDono, "bia@exemplo.test");

        using var cBia = api.ClienteCom(bia, "bia@exemplo.test");
        Assert.Equal(HttpStatusCode.Conflict, (await cBia.PostAsJsonAsync(Aceitar, new { token })).StatusCode);
        Assert.Equal(0L, await Escalar<long>(conexao, "SELECT count(*) FROM convites WHERE usado_em IS NOT NULL"));
    }

    [Fact]
    public async Task Limite_de_50_convites_pendentes_por_workspace_ignora_usados_e_expirados()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        var outroWs = await CriarWorkspace(api, dono, "Outro");
        // 49 pendentes, 5 expirados e 5 usados neste workspace; 50 pendentes em outro workspace (não contam).
        await Executar(conexao, $"""
            INSERT INTO convites (id, workspace_id, email, papel, token_hash, criado_por, criado_em, expira_em, usado_em)
            SELECT gen_random_uuid(), '{ws}'::uuid, 'p' || g || '@x.test', 'membro', sha256(('p' || g)::bytea), '{dono}'::uuid, now(), now() + interval '7 days', NULL::timestamptz FROM generate_series(1, 49) g
            UNION ALL
            SELECT gen_random_uuid(), '{ws}'::uuid, 'e' || g || '@x.test', 'membro', sha256(('e' || g)::bytea), '{dono}'::uuid, now(), now() - interval '1 day', NULL FROM generate_series(1, 5) g
            UNION ALL
            SELECT gen_random_uuid(), '{ws}'::uuid, 'u' || g || '@x.test', 'membro', sha256(('u' || g)::bytea), '{dono}'::uuid, now(), now() + interval '7 days', now() FROM generate_series(1, 5) g
            UNION ALL
            SELECT gen_random_uuid(), '{outroWs}'::uuid, 'o' || g || '@x.test', 'membro', sha256(('o' || g)::bytea), '{dono}'::uuid, now(), now() + interval '7 days', NULL FROM generate_series(1, 50) g
            """);
        using var c = api.ClienteCom(dono, workspace: ws);

        using var quinquagesimo = await c.PostAsJsonAsync(Convites, new { email = "ultimo@x.test", papel = "membro" });
        Assert.Equal(HttpStatusCode.Created, quinquagesimo.StatusCode);
        using var excedente = await c.PostAsJsonAsync(Convites, new { email = "demais@x.test", papel = "membro" });
        Assert.Equal(HttpStatusCode.BadRequest, excedente.StatusCode);
        Assert.Contains("50", (await Json(excedente)).GetProperty("erro").GetString());
    }

    [Theory]
    [InlineData("membro")]
    [InlineData("admin")]
    public async Task Membro_e_admin_listam_mas_nao_convidam_mudam_papel_nem_removem(string papel)
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var pessoa = Guid.NewGuid();
        var outra = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        await AdicionarMembro(api, ws, pessoa, papel);
        await AdicionarMembro(api, ws, outra, Papeis.Membro);
        using var c = api.ClienteCom(pessoa, workspace: ws);

        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync(Membros)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.PostAsJsonAsync(Convites, new { email = "x@x.test", papel = "membro" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.PatchAsJsonAsync($"{Membros}/{outra}", new { papel = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.PatchAsJsonAsync($"{Membros}/{pessoa}", new { papel = "dono" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.DeleteAsync($"{Membros}/{outra}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.DeleteAsync($"{Membros}/{dono}")).StatusCode);

        // Integrações continuam só do dono (D-011), também para admin.
        Assert.Equal(HttpStatusCode.Forbidden, (await c.PutAsJsonAsync("/api/integracoes/github",
            new { token = "abc123456", repositorios = new[] { "dono/repo" } })).StatusCode);

        var lista = await Json(await api.ClienteCom(dono, workspace: ws).GetAsync(Membros));
        Assert.Equal(3, lista.GetArrayLength());
    }

    [Fact]
    public async Task Dono_muda_papel_e_remove_membro()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        await AdicionarMembro(api, ws, bia, Papeis.Membro);
        using var c = api.ClienteCom(dono, workspace: ws);

        using var patch = await c.PatchAsJsonAsync($"{Membros}/{bia}", new { papel = "admin" });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        Assert.Equal("admin", (await Json(patch)).GetProperty("papel").GetString());
        using var invalido = await c.PatchAsJsonAsync($"{Membros}/{bia}", new { papel = "rei" });
        Assert.Equal(HttpStatusCode.BadRequest, invalido.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync($"{Membros}/{bia}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.DeleteAsync($"{Membros}/{bia}")).StatusCode);
        using var cBia = api.ClienteCom(bia, workspace: ws);
        Assert.Equal(HttpStatusCode.NotFound, (await cBia.GetAsync(Membros)).StatusCode);
    }

    [Fact]
    public async Task Ultimo_dono_nao_se_rebaixa_nem_se_remove_mas_pode_depois_de_promover_outro()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        await AdicionarMembro(api, ws, bia, Papeis.Membro);
        using var c = api.ClienteCom(dono, workspace: ws);

        Assert.Equal(HttpStatusCode.Conflict, (await c.PatchAsJsonAsync($"{Membros}/{dono}", new { papel = "membro" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.DeleteAsync($"{Membros}/{dono}")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await c.PatchAsJsonAsync($"{Membros}/{bia}", new { papel = "dono" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.PatchAsJsonAsync($"{Membros}/{dono}", new { papel = "membro" })).StatusCode);

        // A Bia agora é a única dona: também não se rebaixa.
        using var cBia = api.ClienteCom(bia, workspace: ws);
        Assert.Equal(HttpStatusCode.Conflict, (await cBia.PatchAsJsonAsync($"{Membros}/{bia}", new { papel = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await c.DeleteAsync($"{Membros}/{bia}")).StatusCode);
    }

    [Fact]
    public async Task Rebaixamentos_simultaneos_de_dois_donos_deixam_pelo_menos_um_dono()
    {
        var (api, conexao) = await NovaApiAsync();
        await using var _ = api;
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var ws = await CriarWorkspace(api, ana, "Time");
        await AdicionarMembro(api, ws, bia, Papeis.Dono);
        using var cAna = api.ClienteCom(ana, workspace: ws);
        using var cBia = api.ClienteCom(bia, workspace: ws);

        await Task.WhenAll(
            cAna.PatchAsJsonAsync($"{Membros}/{ana}", new { papel = "membro" }),
            cBia.PatchAsJsonAsync($"{Membros}/{bia}", new { papel = "membro" }));

        Assert.Equal(1L, await Escalar<long>(conexao, $"SELECT count(*) FROM workspace_membros WHERE workspace_id = '{ws}' AND papel = 'dono'"));
    }

    [Fact]
    public async Task Dono_de_outro_workspace_nao_ve_nem_altera_membros_daqui()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var ana = Guid.NewGuid();
        var bia = Guid.NewGuid();
        var membroDaAna = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsBia = await CriarWorkspace(api, bia, "Da Bia");
        await AdicionarMembro(api, wsAna, membroDaAna, Papeis.Membro);
        using var cBia = api.ClienteCom(bia, workspace: wsBia);

        var listaBia = await Json(await cBia.GetAsync(Membros));
        Assert.Equal(1, listaBia.GetArrayLength());
        Assert.Equal(bia, listaBia[0].GetProperty("usuarioId").GetGuid());

        Assert.Equal(HttpStatusCode.NotFound, (await cBia.PatchAsJsonAsync($"{Membros}/{membroDaAna}", new { papel = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cBia.DeleteAsync($"{Membros}/{membroDaAna}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cBia.PatchAsJsonAsync($"{Membros}/{ana}", new { papel = "membro" })).StatusCode);

        // Com o cabeçalho do workspace da Ana, a Bia nem é membro: 404 em tudo.
        using var cBiaNaAna = api.ClienteCom(bia, workspace: wsAna);
        Assert.Equal(HttpStatusCode.NotFound, (await cBiaNaAna.GetAsync(Membros)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cBiaNaAna.PostAsJsonAsync(Convites, new { email = "x@x.test" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await cBiaNaAna.DeleteAsync($"{Membros}/{membroDaAna}")).StatusCode);

        var listaAna = await Json(await api.ClienteCom(ana, workspace: wsAna).GetAsync(Membros));
        Assert.Equal(2, listaAna.GetArrayLength());
        Assert.All(listaAna.EnumerateArray(), m => Assert.Equal(m.GetProperty("usuarioId").GetGuid() == ana ? "dono" : "membro", m.GetProperty("papel").GetString()));
    }

    [Fact]
    public async Task Convite_aceito_so_da_acesso_ao_workspace_que_convidou()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var ana = Guid.NewGuid();
        var carla = Guid.NewGuid();
        var wsAna = await CriarWorkspace(api, ana, "Da Ana");
        var wsOutro = await CriarWorkspace(api, Guid.NewGuid(), "Outro");
        var token = await Convidar(api.ClienteCom(ana, workspace: wsAna), "carla@x.test");

        using var cCarla = api.ClienteCom(carla, "carla@x.test");
        Assert.Equal(HttpStatusCode.OK, (await cCarla.PostAsJsonAsync(Aceitar, new { token })).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await api.ClienteCom(carla, workspace: wsAna).GetAsync(Membros)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.ClienteCom(carla, workspace: wsOutro).GetAsync(Membros)).StatusCode);
    }

    [Theory]
    [InlineData("", "membro")]
    [InlineData("sem-arroba", "membro")]
    [InlineData("a b@x.test", "membro")]
    [InlineData("bia@x.test", "dono")]
    [InlineData("bia@x.test", "rei")]
    public async Task Convite_com_email_ou_papel_invalido_devolve_400_com_mensagem(string email, string papel)
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var dono = Guid.NewGuid();
        var ws = await CriarWorkspace(api, dono, "Time");
        using var c = api.ClienteCom(dono, workspace: ws);

        using var r = await c.PostAsJsonAsync(Convites, new { email, papel });

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await Json(r)).GetProperty("erro").GetString()));
    }

    [Fact]
    public async Task Sem_token_devolve_401_e_sem_X_Workspace_Id_devolve_400()
    {
        var (api, _) = await NovaApiAsync();
        await using var __ = api;
        var usuario = Guid.NewGuid();
        await CriarWorkspace(api, usuario, "Time");
        var alvo = Guid.NewGuid();

        using var anonimo = api.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.GetAsync(Membros)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync(Convites, new { email = "x@x.test" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PatchAsJsonAsync($"{Membros}/{alvo}", new { papel = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.DeleteAsync($"{Membros}/{alvo}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonimo.PostAsJsonAsync(Aceitar, new { token = "x" })).StatusCode);

        using var semWorkspace = api.ClienteCom(usuario);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWorkspace.GetAsync(Membros)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWorkspace.PostAsJsonAsync(Convites, new { email = "x@x.test" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWorkspace.PatchAsJsonAsync($"{Membros}/{alvo}", new { papel = "admin" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await semWorkspace.DeleteAsync($"{Membros}/{alvo}")).StatusCode);
    }
}
