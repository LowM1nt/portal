using System.Net;
using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Deploys;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Integracoes;

/// <summary>
/// Handler falso do GitHub: serve respostas gravadas/montadas e NUNCA deixa passar nada para a rede.
/// Qualquer requisição para outro host, ou sem rota registrada, é anotada em <see cref="Inesperadas"/>
/// (e os testes exigem que fique vazio) e recebe 599 — a rede real nunca é tocada.
/// </summary>
public sealed class GitHubFalso : HttpMessageHandler
{
    public const string Host = "api.github.com";

    public delegate HttpResponseMessage Rota(HttpRequestMessage req, int pagina);

    private readonly Dictionary<string, Rota> _rotas = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _trava = new();

    public List<RequisicaoVista> Vistas { get; } = [];
    public List<string> Inesperadas { get; } = [];

    public GitHubFalso Servir(string repo, Rota rota)
    {
        _rotas[$"/repos/{repo}/pulls"] = rota;
        return this;
    }

    public IEnumerable<RequisicaoVista> Pedidos(string repo) =>
        Vistas.Where(v => v.Caminho.Equals($"/repos/{repo}/pulls", StringComparison.OrdinalIgnoreCase));

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var uri = req.RequestUri!;
        var pagina = int.TryParse(System.Web.HttpUtility.ParseQueryString(uri.Query)["page"], out var p) ? p : 1;

        lock (_trava)
        {
            Vistas.Add(new RequisicaoVista(
                uri.Host,
                uri.AbsolutePath,
                pagina,
                req.Headers.Authorization?.ToString(),
                req.Headers.IfNoneMatch.FirstOrDefault()?.ToString(),
                req.Headers.UserAgent.ToString(),
                string.Join(",", req.Headers.Accept.Select(a => a.ToString())),
                uri.Query));

            if (!uri.Host.Equals(Host, StringComparison.OrdinalIgnoreCase) || !_rotas.TryGetValue(uri.AbsolutePath, out var rota))
            {
                Inesperadas.Add(uri.ToString());
                return Task.FromResult(new HttpResponseMessage((HttpStatusCode)599));
            }

            return Task.FromResult(rota(req, pagina));
        }
    }

    public sealed record RequisicaoVista(
        string Host, string Caminho, int Pagina, string? Authorization, string? IfNoneMatch,
        string UserAgent, string Accept, string Query);
}

[Collection("postgres")]
public class ImportadorDePrsTests
{
    private const string Repo = "acme/portal";
    private const string TokenA = "token-de-teste-workspace-a-0001";
    private const string TokenB = "token-de-teste-workspace-b-0002";

    private readonly PostgresFixture _pg;

    public ImportadorDePrsTests(PostgresFixture pg) => _pg = pg;

    // ---------- respostas gravadas ----------

    private static string Gravacao(string nome, [CallerFilePath] string aqui = "") =>
        File.ReadAllText(Path.Combine(Path.GetDirectoryName(aqui)!, "Gravacoes", nome));

    private static string ListaGerada(int de, int ate, string sufixoTitulo = "") =>
        "[" + string.Join(",", Enumerable.Range(de, ate - de + 1).Select(n =>
            $$"""{"number":{{n}},"state":"open","title":"PR {{n}}{{sufixoTitulo}}","user":{"login":"autor{{n % 7}}"},"html_url":"https://github.com/acme/portal/pull/{{n}}","updated_at":"2026-11-19T10:00:00Z"}""")) + "]";

    private static HttpResponseMessage Json(string corpo, HttpStatusCode status = HttpStatusCode.OK,
        string? etag = null, string? proxima = null, int? restante = 4000)
    {
        var r = new HttpResponseMessage(status) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") };
        if (etag is not null) r.Headers.TryAddWithoutValidation("ETag", etag);
        if (proxima is not null) r.Headers.TryAddWithoutValidation("Link", $"<{proxima}>; rel=\"next\", <{proxima}>; rel=\"last\"");
        if (restante is not null) r.Headers.TryAddWithoutValidation("X-RateLimit-Remaining", restante.ToString());
        r.Headers.TryAddWithoutValidation("X-RateLimit-Reset", "1795190000");
        return r;
    }

    private static HttpResponseMessage Sem304(string? etag = null)
    {
        var r = new HttpResponseMessage(HttpStatusCode.NotModified);
        if (etag is not null) r.Headers.TryAddWithoutValidation("ETag", etag);
        r.Headers.TryAddWithoutValidation("X-RateLimit-Remaining", "4000");
        r.Headers.TryAddWithoutValidation("X-RateLimit-Reset", "1795190000");
        return r;
    }

    private static string UrlPagina(int n) => $"https://api.github.com/repositories/1/pulls?state=open&per_page=100&page={n}";

    // ---------- montagem ----------

    private sealed class Mundo(ApiFactory api, GitHubFalso github) : IAsyncDisposable
    {
        public ApiFactory Api { get; } = api;
        public GitHubFalso GitHub { get; } = github;

        public async Task<Guid> NovoWorkspaceAsync(string token, string[] repos)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var ws = new Workspace { Nome = "Time " + Guid.NewGuid().ToString("N")[..6] };
            db.Add(ws);
            await db.SaveChangesAsync();

            escopo.ServiceProvider.GetRequiredService<WorkspaceAtual>().Definir(ws.Id);
            var r = await escopo.ServiceProvider.GetRequiredService<GitHubConfigService>()
                .SalvarAsync(ws.Id, new GitHubConfigPedido(token, repos), CancellationToken.None);
            Assert.Equal(ResultadoTipo.Ok, r.Tipo);
            return ws.Id;
        }

        public async Task<Guid> NovoWorkspaceSemConfigAsync()
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var ws = new Workspace { Nome = "Sem config" };
            db.Add(ws);
            await db.SaveChangesAsync();
            return ws.Id;
        }

        public async Task SemearAsync(Guid workspace, string repo, params (int Numero, string Titulo)[] prs)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var rep = await db.Repositorios.IgnoreQueryFilters()
                .FirstOrDefaultAsync(r => r.WorkspaceId == workspace && r.Nome == repo);
            if (rep is null)
            {
                rep = new Repositorio { WorkspaceId = workspace, Nome = repo };
                db.Add(rep);
            }

            foreach (var (numero, titulo) in prs)
                db.Add(new PullRequest
                {
                    WorkspaceId = workspace, RepositorioId = rep.Id, Numero = numero,
                    Titulo = titulo, Autor = "antigo", Estado = "open",
                });
            await db.SaveChangesAsync();
        }

        public async Task<List<PullRequest>> PrsAsync(Guid workspace)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            return await db.PullRequests.IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.WorkspaceId == workspace).OrderBy(p => p.Numero).ToListAsync();
        }

        public async Task<List<ResultadoImportacao>> ImportarAsync(Guid workspace)
        {
            using var escopo = Api.Services.CreateScope();
            var importador = escopo.ServiceProvider.GetRequiredService<ImportadorDePrs>();
            return (await importador.ImportarWorkspaceAsync(workspace, CancellationToken.None)).ToList();
        }

        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private async Task<Mundo> NovoMundoAsync(GitHubFalso github)
    {
        var api = new ApiGitHubFalso(await _pg.NovoBancoAsync(), github);
        await api.MigrarAsync();
        return new Mundo(api, github);
    }

    private sealed class ApiGitHubFalso(string conexao, GitHubFalso github) : ApiFactory("Testing", conexao)
    {
        protected override void ConfigurarServicos(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder) =>
            builder.ConfigureTestServices(s =>
                s.AddHttpClient<ClienteGitHub>().ConfigurePrimaryHttpMessageHandler(() => github));
    }

    // ---------- testes ----------

    [Fact]
    public async Task Importa_as_2_prs_abertas_no_workspace_da_configuracao()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("prs-abertas-2.json")));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);

        var prs = await mundo.PrsAsync(ws);
        Assert.Equal([12, 15], prs.Select(p => p.Numero));
        Assert.Equal(["Corrige o cálculo de lead time", "Adiciona filtro por ambiente nos deploys"], prs.Select(p => p.Titulo));
        Assert.Equal(["ana-dev", "bruno-dev"], prs.Select(p => p.Autor));
        Assert.All(prs, p => Assert.Equal(ws, p.WorkspaceId));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Importar_duas_vezes_a_mesma_lista_nao_duplica()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("prs-abertas-2.json")));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);
        await mundo.ImportarAsync(ws);

        Assert.Equal([12, 15], (await mundo.PrsAsync(ws)).Select(p => p.Numero));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Pr_que_nao_veio_na_nova_listagem_completa_e_removida()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("prs-abertas-2.json")));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);
        await mundo.SemearAsync(ws, Repo, (12, "Título velho"), (99, "Já foi fechada"));

        await mundo.ImportarAsync(ws);

        var prs = await mundo.PrsAsync(ws);
        Assert.Equal([12, 15], prs.Select(p => p.Numero));
        Assert.Equal("Corrige o cálculo de lead time", prs[0].Titulo);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Listagem_com_duas_paginas_importa_as_duas_e_remove_a_fechada_da_segunda()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, pagina) => pagina == 1
            ? Json(ListaGerada(1, 100), proxima: UrlPagina(2))
            : Json(ListaGerada(101, 105)));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);
        await mundo.SemearAsync(ws, Repo, (103, "Ainda aberta"), (150, "Era da página 2 e foi fechada"));

        await mundo.ImportarAsync(ws);

        var numeros = (await mundo.PrsAsync(ws)).Select(p => p.Numero).ToList();
        Assert.Equal(Enumerable.Range(1, 105), numeros);
        Assert.DoesNotContain(150, numeros);
        Assert.Equal([1, 2], gh.Pedidos(Repo).Select(v => v.Pagina));
        Assert.All(gh.Pedidos(Repo), v => Assert.Contains("per_page=100", v.Query));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Com_mais_de_uma_pagina_nao_envia_if_none_match_e_pr_alterada_ou_fechada_nao_fica_velha()
    {
        var segunda = false;
        var gh = new GitHubFalso().Servir(Repo, (req, pagina) =>
        {
            // Se o importador mandasse If-None-Match, o GitHub (e este falso) responderia 304.
            if (pagina == 1 && req.Headers.IfNoneMatch.Count > 0) return Sem304("\"e1\"");
            return pagina == 1
                ? Json(ListaGerada(1, 100, segunda ? " (editada)" : ""), etag: "\"e1\"", proxima: UrlPagina(2))
                : Json(segunda ? ListaGerada(101, 101) : ListaGerada(101, 102));
        });
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);
        Assert.Equal(102, (await mundo.PrsAsync(ws)).Count);

        segunda = true; // na segunda rodada: PR 1 mudou de título e a PR 102 foi fechada
        await mundo.ImportarAsync(ws);

        Assert.All(gh.Vistas, v => Assert.Null(v.IfNoneMatch));
        var prs = await mundo.PrsAsync(ws);
        Assert.Equal(101, prs.Count);
        Assert.DoesNotContain(prs, p => p.Numero == 102);
        Assert.Equal("PR 1 (editada)", prs.First(p => p.Numero == 1).Titulo);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Resposta_304_em_pagina_unica_mantem_as_prs_e_nao_remove_nenhuma()
    {
        var gh = new GitHubFalso().Servir(Repo, (req, _) =>
            req.Headers.IfNoneMatch.Any(e => e.Tag == "\"v1\"")
                ? Sem304("\"v1\"")
                : Json(Gravacao("prs-abertas-2.json"), etag: "\"v1\""));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);
        await mundo.SemearAsync(ws, Repo, (77, "Só existe no banco"));
        var antes = await mundo.PrsAsync(ws);

        var resultados = await mundo.ImportarAsync(ws);

        var pedidos = gh.Pedidos(Repo).ToList();
        Assert.Equal(2, pedidos.Count);
        Assert.Null(pedidos[0].IfNoneMatch);
        Assert.Equal("\"v1\"", pedidos[1].IfNoneMatch);
        Assert.Equal(StatusImportacao.SemMudanca, Assert.Single(resultados).Status);
        var depois = await mundo.PrsAsync(ws);
        Assert.Equal(antes.Select(p => (p.Numero, p.Titulo, p.Autor)), depois.Select(p => (p.Numero, p.Titulo, p.Autor)));
        Assert.Contains(depois, p => p.Numero == 77);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Token_invalido_401_devolve_erro_tipado_e_nao_apaga_nem_altera_as_prs()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("erro-401.json"), HttpStatusCode.Unauthorized));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);
        await mundo.SemearAsync(ws, Repo, (12, "Título que não pode mudar"), (99, "Também fica"));

        var resultados = await mundo.ImportarAsync(ws);

        Assert.Equal(StatusImportacao.TokenInvalido, Assert.Single(resultados).Status);
        var prs = await mundo.PrsAsync(ws);
        Assert.Equal([12, 99], prs.Select(p => p.Numero));
        Assert.Equal(["Título que não pode mudar", "Também fica"], prs.Select(p => p.Titulo));
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Com_limite_baixo_para_antes_da_proxima_pagina_nao_remove_nada_e_informa_limite_atingido()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, pagina) => pagina == 1
            ? Json(ListaGerada(1, 100), proxima: UrlPagina(2), restante: 10)
            : Json(ListaGerada(101, 105)));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);
        await mundo.SemearAsync(ws, Repo, (150, "Está só no banco"), (999, "Também só no banco"));

        var resultados = await mundo.ImportarAsync(ws);

        Assert.Equal([1], gh.Pedidos(Repo).Select(v => v.Pagina));
        Assert.Equal(StatusImportacao.LimiteAtingido, Assert.Single(resultados).Status);
        var numeros = (await mundo.PrsAsync(ws)).Select(p => p.Numero).ToList();
        Assert.Contains(150, numeros);
        Assert.Contains(999, numeros);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Limite_acima_do_minimo_continua_para_a_proxima_pagina()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, pagina) => pagina == 1
            ? Json(ListaGerada(1, 100), proxima: UrlPagina(2), restante: 11)
            : Json(ListaGerada(101, 105), restante: 10));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);

        Assert.Equal([1, 2], gh.Pedidos(Repo).Select(v => v.Pagina));
        Assert.Equal(105, (await mundo.PrsAsync(ws)).Count);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Prs_e_configuracao_de_um_workspace_nunca_valem_para_o_outro()
    {
        var gh = new GitHubFalso().Servir(Repo, (req, _) =>
            req.Headers.Authorization?.Parameter == TokenA
                ? Json(ListaGerada(1, 2))
                : Json(ListaGerada(500, 503)));
        await using var mundo = await NovoMundoAsync(gh);
        var a = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);
        var b = await mundo.NovoWorkspaceAsync(TokenB, [Repo]);
        var semConfig = await mundo.NovoWorkspaceSemConfigAsync();

        await mundo.ImportarAsync(a);

        Assert.Equal([1, 2], (await mundo.PrsAsync(a)).Select(p => p.Numero));
        Assert.Empty(await mundo.PrsAsync(b));
        Assert.All(gh.Vistas, v => Assert.Equal($"Bearer {TokenA}", v.Authorization));

        var pedidosAntes = gh.Vistas.Count;
        await mundo.ImportarAsync(semConfig); // sem configuração própria: não usa a do A nem a do B
        Assert.Equal(pedidosAntes, gh.Vistas.Count);
        Assert.Empty(await mundo.PrsAsync(semConfig));

        await mundo.ImportarAsync(b);

        Assert.Equal([1, 2], (await mundo.PrsAsync(a)).Select(p => p.Numero));
        Assert.Equal([500, 501, 502, 503], (await mundo.PrsAsync(b)).Select(p => p.Numero));
        Assert.Equal($"Bearer {TokenB}", gh.Vistas.Last().Authorization);
        Assert.Empty(gh.Inesperadas);
    }

    [Fact]
    public async Task Nenhuma_chamada_vai_para_fora_do_handler_falso_e_a_requisicao_segue_o_padrao_do_github()
    {
        var gh = new GitHubFalso().Servir(Repo, (_, _) => Json(Gravacao("prs-abertas-2.json")));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [Repo]);

        await mundo.ImportarAsync(ws);

        var v = Assert.Single(gh.Vistas);
        Assert.Equal(GitHubFalso.Host, v.Host);
        Assert.Equal($"Bearer {TokenA}", v.Authorization);
        Assert.False(string.IsNullOrWhiteSpace(v.UserAgent));
        Assert.Contains("application/vnd.github", v.Accept);
        Assert.Contains("per_page=100", v.Query);
        Assert.Empty(gh.Inesperadas);
    }
}
