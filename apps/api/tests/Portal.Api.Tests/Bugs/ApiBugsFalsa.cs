using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Portal.Api.Bugs;
using Portal.Api.Bugs.Discord;
using Portal.Api.Bugs.Extracao;
using Portal.Api.Dados;
using Portal.Api.Tests.Integracoes;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Bugs;

/// <summary>
/// Handler falso de um serviço externo (Discord, Gemini): responde com o que o teste mandar e NUNCA deixa passar nada
/// para a rede. Requisição para outro host vai para <see cref="Inesperadas"/> e recebe 599.
/// </summary>
public sealed class HandlerGravado(string host) : HttpMessageHandler
{
    public delegate HttpResponseMessage Responder(HttpRequestMessage req, string corpo);

    private readonly object _trava = new();
    private readonly Queue<Responder> _fila = new();

    /// <summary>Usado quando a fila está vazia.</summary>
    public Responder Padrao { get; set; } = (_, _) => new HttpResponseMessage((HttpStatusCode)599);

    public List<Vista> Vistas { get; } = [];
    public List<string> Inesperadas { get; } = [];

    public HandlerGravado Depois(Responder r)
    {
        lock (_trava) _fila.Enqueue(r);
        return this;
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var corpo = req.Content is null ? "" : await req.Content.ReadAsStringAsync(ct);
        lock (_trava)
        {
            var cabecalhos = req.Headers.ToDictionary(h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase);
            Vistas.Add(new Vista(req.Method.Method, req.RequestUri!, cabecalhos, corpo));
            if (!req.RequestUri!.Host.Equals(host, StringComparison.OrdinalIgnoreCase))
            {
                Inesperadas.Add(req.RequestUri.ToString());
                return new HttpResponseMessage((HttpStatusCode)599);
            }

            var r = _fila.Count > 0 ? _fila.Dequeue() : Padrao;
            return r(req, corpo);
        }
    }

    public sealed record Vista(string Metodo, Uri Uri, IReadOnlyDictionary<string, string> Cabecalhos, string Corpo);

    // ---------- respostas ----------

    public static string Gravacao(string nome, [CallerFilePath] string aqui = "") =>
        File.ReadAllText(Path.Combine(Path.GetDirectoryName(aqui)!, "Gravacoes", nome));

    public static HttpResponseMessage Json(string corpo, HttpStatusCode status = HttpStatusCode.OK,
        params (string Nome, string Valor)[] cabecalhos)
    {
        var r = new HttpResponseMessage(status) { Content = new StringContent(corpo, Encoding.UTF8, "application/json") };
        foreach (var (nome, valor) in cabecalhos) r.Headers.TryAddWithoutValidation(nome, valor);
        return r;
    }

    /// <summary>Envelope do generateContent do Gemini com <paramref name="texto"/> como saída do modelo.</summary>
    public static HttpResponseMessage Gemini(string texto) =>
        Json(JsonSerializer.Serialize(new
        {
            candidates = new[] { new { content = new { role = "model", parts = new[] { new { text = texto } } }, finishReason = "STOP" } },
        }));
}

/// <summary>A API com Discord e Gemini falsos, relógio controlado e logs capturados.</summary>
public sealed class ApiBugsFalsa : ApiFactory
{
    public const string Canal = "123456789012345678";

    public HandlerGravado Discord { get; } = new(ClienteDiscord.Host);
    public HandlerGravado Gemini { get; } = new(ClienteGemini.Host);
    public RelogioFalso Relogio { get; } = new();
    public LogsCapturados Logs { get; } = new();

    public ApiBugsFalsa(string conexao) : base("Testing", conexao)
    {
        // Perto da hora real: o JWT de teste é válido por 1 h a partir de agora.
        Relogio.Avancar(DateTimeOffset.UtcNow - Relogio.GetUtcNow());
    }

    protected override void ConfigurarServicos(IWebHostBuilder builder)
    {
        builder.ConfigureLogging(l =>
        {
            l.SetMinimumLevel(LogLevel.Trace);
            l.AddProvider(Logs);
        });
        builder.ConfigureTestServices(s =>
        {
            s.AddSingleton<TimeProvider>(Relogio);
            s.AddHttpClient<ClienteDiscord>().ConfigurePrimaryHttpMessageHandler(() => Discord);
            s.AddHttpClient<ClienteGemini>().ConfigurePrimaryHttpMessageHandler(() => Gemini);
        });
    }

    public static async Task<ApiBugsFalsa> CriarAsync(PostgresFixture pg)
    {
        var api = new ApiBugsFalsa(await pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    /// <summary>Cria um workspace pelo endpoint (quem cria é dono). Devolve o cliente do dono e o id.</summary>
    public async Task<(HttpClient Dono, Guid Workspace)> NovoWorkspaceAsync()
    {
        var usuario = Guid.NewGuid();
        using var c = ClienteCom(usuario);
        using var r = await c.PostAsJsonAsync("/api/workspaces", new { nome = "Time" });
        var ws = (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        return (ClienteCom(usuario, workspace: ws), ws);
    }

    public async Task<HttpClient> NovoMembroAsync(Guid ws, string papel = Papeis.Membro)
    {
        var membro = Guid.NewGuid();
        using var escopo = Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        db.WorkspaceMembros.Add(new WorkspaceMembro { WorkspaceId = ws, UsuarioId = membro, Papel = papel });
        await db.SaveChangesAsync();
        return ClienteCom(membro, workspace: ws);
    }

    public async Task ConfigurarDiscordAsync(HttpClient dono, string token)
    {
        using var r = await dono.PutAsJsonAsync("/api/integracoes/discord", new { token, canalId = Canal });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    public async Task ConfigurarIaAsync(HttpClient dono, string chave)
    {
        using var r = await dono.PutAsJsonAsync("/api/integracoes/ia", new { provedor = "gemini", chave });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    public Task CicloDoDiscordAsync() =>
        new CaptacaoDoDiscord(Services.GetRequiredService<IServiceScopeFactory>(), Relogio,
                Services.GetRequiredService<ILogger<CaptacaoDoDiscord>>())
            .ExecutarCicloAsync(CancellationToken.None);

    public async Task<int> ProcessarIaAsync()
    {
        using var escopo = Services.CreateScope();
        return await escopo.ServiceProvider.GetRequiredService<ProcessadorDeExtracao>().ProcessarPendentesAsync(CancellationToken.None);
    }

    public async Task<List<Bug>> BugsAsync(Guid ws)
    {
        using var escopo = Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return await db.Bugs.IgnoreQueryFilters().AsNoTracking().Where(b => b.WorkspaceId == ws).OrderBy(b => b.CriadoEm).ThenBy(b => b.MensagemExternaId).ToListAsync();
    }

    public async Task<List<SugestaoIa>> SugestoesAsync(Guid ws)
    {
        using var escopo = Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return await db.SugestoesIa.IgnoreQueryFilters().AsNoTracking().Where(s => s.WorkspaceId == ws).ToListAsync();
    }

    public async Task<ConfiguracaoDiscord?> ConfigDiscordAsync(Guid ws)
    {
        using var escopo = Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return await db.ConfiguracoesDiscord.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(c => c.WorkspaceId == ws);
    }

    public async Task<Guid> CriarBugAsync(HttpClient c, string titulo, string relato)
    {
        using var r = await c.PostAsJsonAsync("/api/bugs", new { titulo, relato, severidade = "media", origem = "manual" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
}
