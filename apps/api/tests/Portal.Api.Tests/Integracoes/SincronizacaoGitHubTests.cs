using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Integracoes;

/// <summary>Relógio falso mínimo (o pacote TimeProvider.Testing não está no projeto): só avança quando o teste manda.</summary>
public sealed class RelogioFalso : TimeProvider
{
    private readonly object _trava = new();
    private readonly List<TimerFalso> _timers = [];
    private DateTimeOffset _agora = new(2026, 11, 20, 3, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow()
    {
        lock (_trava) return _agora;
    }

    public int TimersAtivos
    {
        get { lock (_trava) return _timers.Count(t => !t.Descartado); }
    }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = new TimerFalso(this, callback, state);
        timer.Change(dueTime, period);
        lock (_trava) _timers.Add(timer);
        return timer;
    }

    public void Avancar(TimeSpan delta)
    {
        var alvo = GetUtcNow() + delta;
        while (true)
        {
            TimerFalso? proximo;
            lock (_trava)
            {
                proximo = _timers.Where(t => t.Vence is not null && t.Vence <= alvo && !t.Descartado)
                    .OrderBy(t => t.Vence).FirstOrDefault();
                if (proximo is null)
                {
                    _agora = alvo;
                    return;
                }

                _agora = proximo.Vence!.Value > _agora ? proximo.Vence.Value : _agora;
            }

            proximo.Disparar();
        }
    }

    internal sealed class TimerFalso(RelogioFalso relogio, TimerCallback callback, object? state) : ITimer
    {
        private TimeSpan _periodo = Timeout.InfiniteTimeSpan;
        public DateTimeOffset? Vence { get; private set; }
        public bool Descartado { get; private set; }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            lock (relogio._trava)
            {
                _periodo = period;
                Vence = dueTime == Timeout.InfiniteTimeSpan ? null : relogio._agora + dueTime;
            }

            return true;
        }

        public void Disparar()
        {
            lock (relogio._trava)
                Vence = _periodo == Timeout.InfiniteTimeSpan || _periodo == TimeSpan.Zero ? null : Vence + _periodo;
            callback(state);
        }

        public void Dispose()
        {
            lock (relogio._trava)
            {
                Descartado = true;
                Vence = null;
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}

/// <summary>Conta os ciclos (um escopo de DI por ciclo) e, se mandado, derruba os primeiros.</summary>
public sealed class FabricaDeEscoposContadora(IServiceScopeFactory real) : IServiceScopeFactory
{
    private int _ciclos;
    private int _falhasRestantes;

    public int Ciclos => Volatile.Read(ref _ciclos);

    public void FalharOsProximos(int quantos) => _falhasRestantes = quantos;

    public IServiceScope CreateScope()
    {
        Interlocked.Increment(ref _ciclos);
        if (_falhasRestantes > 0)
        {
            _falhasRestantes--;
            throw new InvalidOperationException("falha inesperada no ciclo");
        }

        return real.CreateScope();
    }
}

[Collection("postgres")]
public class SincronizacaoGitHubTests
{
    private const string RepoA = "acme/a";
    private const string RepoB = "acme/b";
    private const string TokenA = "token-SEGREDO-workspace-a-0001-wxyz";
    private const string TokenB = "token-SEGREDO-workspace-b-0002-wxyz";
    private static readonly TimeSpan DezMinutos = TimeSpan.FromMinutes(10);

    private readonly PostgresFixture _pg;

    public SincronizacaoGitHubTests(PostgresFixture pg) => _pg = pg;

    private static HttpResponseMessage Json(string corpo, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") };

    private static string Lista(params (int Numero, string Titulo)[] prs) =>
        "[" + string.Join(",", prs.Select(p =>
            $$"""{"number":{{p.Numero}},"state":"open","title":"{{p.Titulo}}","user":{"login":"ana"},"html_url":"https://github.com/x/y/pull/{{p.Numero}}","updated_at":"2026-11-19T10:00:00Z"}""")) + "]";

    private sealed class ApiGitHubFalso(string conexao, GitHubFalso github) : ApiFactory("Testing", conexao)
    {
        protected override void ConfigurarServicos(IWebHostBuilder builder) =>
            builder.ConfigureTestServices(s =>
                s.AddHttpClient<ClienteGitHub>().ConfigurePrimaryHttpMessageHandler(() => github));
    }

    private sealed class Mundo(ApiFactory api, GitHubFalso github) : IAsyncDisposable
    {
        public ApiFactory Api { get; } = api;
        public GitHubFalso GitHub { get; } = github;
        public RelogioFalso Relogio { get; } = new();
        public FabricaDeEscoposContadora Escopos { get; } =
            new(api.Services.GetRequiredService<IServiceScopeFactory>());

        /// <summary>O serviço construído à mão: no ambiente Testing ele não é registrado no host.</summary>
        public SincronizacaoGitHub NovoServico() =>
            new(Escopos, Relogio, NullLogger<SincronizacaoGitHub>.Instance);

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

        public async Task DefinirErroAnteriorAsync(Guid ws, string erro)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var c = await db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters().FirstAsync(x => x.WorkspaceId == ws);
            c.UltimoErro = erro;
            await db.SaveChangesAsync();
        }

        public async Task<ConfiguracaoGitHub?> ConfigAsync(Guid ws)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            return await db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(x => x.WorkspaceId == ws);
        }

        public async Task SemearPrAsync(Guid ws, string repo, int numero, string titulo)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var rep = new Repositorio { WorkspaceId = ws, Nome = repo };
            db.Add(rep);
            db.Add(new PullRequest
            {
                WorkspaceId = ws, RepositorioId = rep.Id, Numero = numero,
                Titulo = titulo, Autor = "ana", Estado = "open",
            });
            await db.SaveChangesAsync();
        }

        public async Task<List<PullRequest>> PrsAsync(Guid ws)
        {
            using var escopo = Api.Services.CreateScope();
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            return await db.PullRequests.IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.WorkspaceId == ws).OrderBy(p => p.Numero).ToListAsync();
        }

        public async Task EsperarAsync(Func<Task<bool>> condicao, string o_que)
        {
            var limite = DateTime.UtcNow.AddSeconds(15);
            while (DateTime.UtcNow < limite)
            {
                if (await condicao()) return;
                await Task.Delay(25);
            }

            Assert.Fail("Tempo esgotado esperando: " + o_que);
        }

        /// <summary>Inicia o serviço, espera o timer existir, avança 10 min e espera o ciclo acabar.</summary>
        public async Task<SincronizacaoGitHub> IniciarEAvancarUmCicloAsync()
        {
            var servico = NovoServico();
            await servico.StartAsync(CancellationToken.None);
            await EsperarAsync(() => Task.FromResult(Relogio.TimersAtivos > 0), "o serviço criar o timer");
            var antes = Escopos.Ciclos;
            Relogio.Avancar(DezMinutos);
            await EsperarAsync(() => Task.FromResult(Escopos.Ciclos > antes), "o ciclo começar");
            return servico;
        }

        public async Task EsperarSincronizadoAsync(params Guid[] workspaces)
        {
            foreach (var ws in workspaces)
                await EsperarAsync(async () => (await ConfigAsync(ws))?.UltimaSincronizacao is not null,
                    "a sincronização do workspace");
        }

        public ValueTask DisposeAsync() => Api.DisposeAsync();
    }

    private async Task<Mundo> NovoMundoAsync(GitHubFalso github)
    {
        var api = new ApiGitHubFalso(await _pg.NovoBancoAsync(), github);
        await api.MigrarAsync();
        return new Mundo(api, github);
    }

    // ---------- testes ----------

    [Fact]
    public async Task Nao_executa_antes_de_10_minutos_e_executa_um_ciclo_a_cada_10_minutos()
    {
        var gh = new GitHubFalso().Servir(RepoA, (_, _) => Json(Lista((1, "PR 1"))));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        var servico = mundo.NovoServico();
        await servico.StartAsync(CancellationToken.None);
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Relogio.TimersAtivos > 0), "o timer");

        mundo.Relogio.Avancar(TimeSpan.FromMinutes(9) + TimeSpan.FromSeconds(59));
        await Task.Delay(300);
        Assert.Equal(0, mundo.Escopos.Ciclos);
        Assert.Empty(gh.Vistas);

        mundo.Relogio.Avancar(TimeSpan.FromSeconds(1));
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Escopos.Ciclos == 1), "o 1º ciclo");
        await mundo.EsperarSincronizadoAsync(ws);
        Assert.Equal(1, mundo.Escopos.Ciclos);

        mundo.Relogio.Avancar(DezMinutos);
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Escopos.Ciclos == 2), "o 2º ciclo");
        await Task.Delay(300);
        Assert.Equal(2, mundo.Escopos.Ciclos);

        await servico.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task So_sincroniza_workspaces_com_token_e_ignora_o_sem_configuracao()
    {
        var gh = new GitHubFalso().Servir(RepoA, (_, _) => Json(Lista((1, "PR 1"))));
        await using var mundo = await NovoMundoAsync(gh);
        var comToken = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        var semConfig = await mundo.NovoWorkspaceSemConfigAsync();

        var servico = await mundo.IniciarEAvancarUmCicloAsync();
        await mundo.EsperarSincronizadoAsync(comToken);
        await servico.StopAsync(CancellationToken.None);

        Assert.Single((await mundo.PrsAsync(comToken)));
        Assert.Empty(await mundo.PrsAsync(semConfig));
        Assert.Null(await mundo.ConfigAsync(semConfig));
        Assert.All(gh.Vistas, v => Assert.Equal($"Bearer {TokenA}", v.Authorization));
        Assert.Empty(gh.Inesperadas);
    }

    [Theory]
    [InlineData("401")]
    [InlineData("rede")]
    [InlineData("excecao")]
    public async Task Falha_no_workspace_A_grava_erro_sem_token_e_o_B_sincroniza_normalmente(string falha)
    {
        var gh = new GitHubFalso()
            .Servir(RepoA, (_, _) => falha switch
            {
                "401" => Json("""{"message":"Bad credentials"}""", HttpStatusCode.Unauthorized),
                "rede" => throw new HttpRequestException($"sem rede (Bearer {TokenA})"),
                _ => throw new InvalidCastException($"estourou com {TokenA}"),
            })
            .Servir(RepoB, (_, _) => Json(Lista((7, "PR do B"))));
        await using var mundo = await NovoMundoAsync(gh);
        var a = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        var b = await mundo.NovoWorkspaceAsync(TokenB, [RepoB]);

        var servico = await mundo.IniciarEAvancarUmCicloAsync();
        await mundo.EsperarSincronizadoAsync(a, b);
        await servico.StopAsync(CancellationToken.None);

        var cfgA = (await mundo.ConfigAsync(a))!;
        Assert.False(string.IsNullOrWhiteSpace(cfgA.UltimoErro));
        Assert.NotNull(cfgA.UltimaSincronizacao);
        Assert.DoesNotContain(TokenA, cfgA.UltimoErro);
        Assert.DoesNotContain(TokenB, cfgA.UltimoErro);
        Assert.True(cfgA.UltimoErro!.Length <= 200, "mensagem curta");

        var cfgB = (await mundo.ConfigAsync(b))!;
        Assert.Null(cfgB.UltimoErro);
        Assert.NotNull(cfgB.UltimaSincronizacao);
        Assert.Equal([7], (await mundo.PrsAsync(b)).Select(p => p.Numero));
    }

    [Fact]
    public async Task Sucesso_limpa_o_erro_anterior_e_o_erro_de_um_workspace_nao_vai_para_o_outro()
    {
        var gh = new GitHubFalso()
            .Servir(RepoA, (_, _) => Json(Lista((1, "PR 1"))))
            .Servir(RepoB, (_, _) => Json("""{"message":"Bad credentials"}""", HttpStatusCode.Unauthorized));
        await using var mundo = await NovoMundoAsync(gh);
        var a = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        var b = await mundo.NovoWorkspaceAsync(TokenB, [RepoB]);
        await mundo.DefinirErroAnteriorAsync(a, "token expirado");

        var servico = await mundo.IniciarEAvancarUmCicloAsync();
        await mundo.EsperarSincronizadoAsync(a, b);
        await servico.StopAsync(CancellationToken.None);

        var cfgA = (await mundo.ConfigAsync(a))!;
        Assert.Null(cfgA.UltimoErro);
        Assert.NotNull(cfgA.UltimaSincronizacao);

        var cfgB = (await mundo.ConfigAsync(b))!;
        Assert.False(string.IsNullOrWhiteSpace(cfgB.UltimoErro));
        Assert.NotNull(cfgB.UltimaSincronizacao);
    }

    [Fact]
    public async Task Excecao_inesperada_no_ciclo_nao_derruba_o_servico_e_o_ciclo_seguinte_roda()
    {
        var gh = new GitHubFalso().Servir(RepoA, (_, _) => Json(Lista((1, "PR 1"))));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        mundo.Escopos.FalharOsProximos(1);

        var servico = mundo.NovoServico();
        await servico.StartAsync(CancellationToken.None);
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Relogio.TimersAtivos > 0), "o timer");

        mundo.Relogio.Avancar(DezMinutos);
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Escopos.Ciclos == 1), "o ciclo que falha");
        await Task.Delay(300);
        Assert.Null((await mundo.ConfigAsync(ws))!.UltimaSincronizacao);

        mundo.Relogio.Avancar(DezMinutos);
        await mundo.EsperarAsync(() => Task.FromResult(mundo.Escopos.Ciclos == 2), "o ciclo seguinte");
        await mundo.EsperarSincronizadoAsync(ws);

        Assert.Equal([1], (await mundo.PrsAsync(ws)).Select(p => p.Numero));
        await servico.StopAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Prs_ja_importadas_permanecem_depois_de_uma_falha_de_sincronizacao()
    {
        var gh = new GitHubFalso().Servir(RepoA, (_, _) => Json("""{"message":"Bad credentials"}""", HttpStatusCode.Unauthorized));
        await using var mundo = await NovoMundoAsync(gh);
        var ws = await mundo.NovoWorkspaceAsync(TokenA, [RepoA]);
        await mundo.SemearPrAsync(ws, RepoA, 42, "Dado bom de antes");

        var servico = await mundo.IniciarEAvancarUmCicloAsync();
        await mundo.EsperarSincronizadoAsync(ws);
        await servico.StopAsync(CancellationToken.None);

        var prs = await mundo.PrsAsync(ws);
        Assert.Equal([42], prs.Select(p => p.Numero));
        Assert.Equal("Dado bom de antes", prs[0].Titulo);
        Assert.False(string.IsNullOrWhiteSpace((await mundo.ConfigAsync(ws))!.UltimoErro));
    }

    [Fact]
    public async Task Get_da_integracao_devolve_ultimo_erro_e_ultima_sincronizacao_sem_expor_o_token()
    {
        var gh = new GitHubFalso().Servir(RepoA, (_, _) => Json("""{"message":"Bad credentials"}""", HttpStatusCode.Unauthorized));
        await using var mundo = await NovoMundoAsync(gh);
        var usuario = Guid.NewGuid();
        Guid ws;
        using (var criar = mundo.Api.ClienteCom(usuario))
        {
            var r = await criar.PostAsJsonAsync("/api/workspaces", new { nome = "Time" });
            ws = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        }

        using var cliente = mundo.Api.ClienteCom(usuario, workspace: ws);
        var put = await cliente.PutAsJsonAsync("/api/integracoes/github", new { token = TokenA, repositorios = new[] { RepoA } });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var servico = await mundo.IniciarEAvancarUmCicloAsync();
        await mundo.EsperarSincronizadoAsync(ws);
        await servico.StopAsync(CancellationToken.None);

        var resp = await cliente.GetAsync("/api/integracoes/github");
        var corpo = await resp.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.DoesNotContain(TokenA, corpo);
        var json = JsonDocument.Parse(corpo).RootElement;
        Assert.Equal(JsonValueKind.String, json.GetProperty("ultimoErro").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("ultimoErro").GetString()));
        Assert.Equal(JsonValueKind.String, json.GetProperty("ultimaSincronizacao").ValueKind);
    }
}
