using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;

namespace Portal.Api.Tests;

[Collection("postgres")]
public class RevisoesTests
{
    private readonly PostgresFixture _pg;

    public RevisoesTests(PostgresFixture pg) => _pg = pg;

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

    private static async Task Semear(ApiFactory api, Guid ws, string repo, params PullRequest[] prs)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var rep = new Repositorio { WorkspaceId = ws, Nome = repo };
        db.Add(rep);
        foreach (var p in prs)
        {
            p.WorkspaceId = ws;
            p.RepositorioId = rep.Id;
            db.Add(p);
        }

        await db.SaveChangesAsync();
    }

    private static PullRequest Pr(int numero, string[]? revisores = null, string[]? equipes = null,
        bool draft = false, string estado = "open", string atualizada = "2026-11-10T10:00:00Z", string ci = "sucesso") => new()
    {
        Numero = numero, Titulo = $"PR {numero}", Autor = "ana-dev", Estado = estado,
        Url = $"https://github.com/acme/portal/pull/{numero}", AtualizadaEm = DateTimeOffset.Parse(atualizada),
        StatusCi = ci, Draft = draft,
        RevisoresSolicitados = revisores is null ? [] : [.. revisores],
        EquipesSolicitadas = equipes is null ? [] : [.. equipes],
    };

    private static async Task<JsonElement> Listar(HttpClient c, string consulta = "")
    {
        using var r = await c.GetAsync("/api/revisoes" + consulta);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static int[] Numeros(JsonElement lista) =>
        lista.EnumerateArray().Select(e => e.GetProperty("numero").GetInt32()).ToArray();

    [Fact]
    public async Task Devolve_so_prs_aguardando_revisao_no_formato_do_contrato()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await Semear(api, ws, "acme/portal",
            Pr(1, revisores: ["bruno-dev"], equipes: ["Time Backend"], ci: "falhou", atualizada: "2026-11-12T08:30:00Z"));
        using var c = api.ClienteCom(usuario, workspace: ws);

        var lista = await Listar(c);

        var item = Assert.Single(lista.EnumerateArray());
        Assert.Equal(1, item.GetProperty("numero").GetInt32());
        Assert.Equal("PR 1", item.GetProperty("titulo").GetString());
        Assert.Equal("ana-dev", item.GetProperty("autor").GetString());
        Assert.Equal("https://github.com/acme/portal/pull/1", item.GetProperty("url").GetString());
        Assert.Equal("acme/portal", item.GetProperty("repositorio").GetString());
        Assert.Equal("falhou", item.GetProperty("statusCi").GetString());
        Assert.Equal(DateTimeOffset.Parse("2026-11-12T08:30:00Z"), item.GetProperty("atualizadaEm").GetDateTimeOffset());
        Assert.Equal(new[] { "bruno-dev", "Time Backend" },
            item.GetProperty("revisores").EnumerateArray().Select(e => e.GetString()!).ToArray());
    }

    [Fact]
    public async Task Rascunho_sem_revisor_pendente_e_pr_fechada_nao_aparecem()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await Semear(api, ws, "acme/portal",
            Pr(1, revisores: ["bruno-dev"]),
            Pr(2, revisores: ["bruno-dev"], draft: true),
            Pr(3),
            Pr(4, revisores: ["bruno-dev"], estado: "closed"),
            Pr(5, equipes: ["Time Backend"]));
        using var c = api.ClienteCom(usuario, workspace: ws);

        var numeros = Numeros(await Listar(c));
        Assert.Equal(new[] { 1, 5 }, numeros.Order().ToArray());
    }

    [Fact]
    public async Task Ordena_das_mais_antigas_para_as_mais_recentes()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await Semear(api, ws, "acme/portal",
            Pr(1, ["a"], atualizada: "2026-11-15T10:00:00Z"),
            Pr(2, ["a"], atualizada: "2026-11-01T10:00:00Z"),
            Pr(3, ["a"], atualizada: "2026-11-08T10:00:00Z"));
        using var c = api.ClienteCom(usuario, workspace: ws);

        var numeros = Numeros(await Listar(c));
        Assert.Equal(new[] { 2, 3, 1 }, numeros);
    }

    [Fact]
    public async Task Filtros_por_repositorio_e_por_revisor_e_a_combinacao_deles()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await Semear(api, ws, "acme/portal",
            Pr(1, ["bruno-dev"], atualizada: "2026-11-01T10:00:00Z"),
            Pr(2, ["carla-dev"], atualizada: "2026-11-02T10:00:00Z"));
        await Semear(api, ws, "acme/outro",
            Pr(3, ["bruno-dev"], atualizada: "2026-11-03T10:00:00Z"),
            Pr(4, ["carla-dev"], atualizada: "2026-11-04T10:00:00Z"));
        using var c = api.ClienteCom(usuario, workspace: ws);

        var porRepo = Numeros(await Listar(c, "?repositorio=acme/portal"));
        var porRevisor = Numeros(await Listar(c, "?revisor=bruno-dev"));
        var ambos = Numeros(await Listar(c, "?repositorio=acme/outro&revisor=bruno-dev"));
        Assert.Equal(new[] { 1, 2 }, porRepo);
        Assert.Equal(new[] { 1, 3 }, porRevisor);
        Assert.Equal(new[] { 3 }, ambos);
    }

    [Fact]
    public async Task Workspaces_nao_se_enxergam_e_nao_membro_recebe_404()
    {
        await using var api = await NovaApiAsync();
        var usuarioA = Guid.NewGuid();
        var usuarioB = Guid.NewGuid();
        var wsA = await CriarWorkspace(api, usuarioA, "A");
        var wsB = await CriarWorkspace(api, usuarioB, "B");
        await Semear(api, wsA, "acme/portal", Pr(1, ["bruno-dev"]));
        await Semear(api, wsB, "acme/portal", Pr(2, ["bruno-dev"]));

        using var a = api.ClienteCom(usuarioA, workspace: wsA);
        using var b = api.ClienteCom(usuarioB, workspace: wsB);
        var deA = Numeros(await Listar(a));
        var deB = Numeros(await Listar(b));
        Assert.Equal(new[] { 1 }, deA);
        Assert.Equal(new[] { 2 }, deB);

        using var intruso = api.ClienteCom(usuarioA, workspace: wsB);
        using var r = await intruso.GetAsync("/api/revisoes");
        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
    }

    [Fact]
    public async Task Sem_token_401_e_sem_workspace_400()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        await CriarWorkspace(api, usuario, "Time");

        using var anonimo = api.CreateClient();
        using var r401 = await anonimo.GetAsync("/api/revisoes");
        Assert.Equal(HttpStatusCode.Unauthorized, r401.StatusCode);

        using var semWs = api.ClienteCom(usuario);
        using var r400 = await semWs.GetAsync("/api/revisoes");
        Assert.Equal(HttpStatusCode.BadRequest, r400.StatusCode);
    }

    [Fact]
    public async Task Workspace_sem_prs_aguardando_revisao_devolve_lista_vazia()
    {
        await using var api = await NovaApiAsync();
        var usuario = Guid.NewGuid();
        var ws = await CriarWorkspace(api, usuario, "Time");
        await Semear(api, ws, "acme/portal", Pr(1), Pr(2, ["a"], draft: true));
        using var c = api.ClienteCom(usuario, workspace: ws);

        var lista = await Listar(c);

        Assert.Equal(JsonValueKind.Array, lista.ValueKind);
        Assert.Empty(lista.EnumerateArray());
    }
}
