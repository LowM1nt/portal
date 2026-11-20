using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests;

/// <summary>Entidade de negócio só para o teste: tem WorkspaceId, logo recebe o query filter global.</summary>
public class ItemDeTeste
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Texto { get; set; } = "";
}

// Contrato esperado do PortalDbContext: construtor protegido (DbContextOptions, WorkspaceAtual) e
// OnModelCreating que aplica o filtro a todo tipo com WorkspaceId (exceto WorkspaceMembro).
public class PortalDbContextDeTeste : PortalDbContext
{
    public PortalDbContextDeTeste(DbContextOptions<PortalDbContextDeTeste> options, WorkspaceAtual workspaceAtual)
        : base(options, workspaceAtual)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ItemDeTeste>();
        base.OnModelCreating(modelBuilder);
    }
}

public class ApiComRotaDeNegocio : ApiFactory
{
    private readonly string _banco = Guid.NewGuid().ToString();

    public ApiComRotaDeNegocio() : base("Testing")
    {
    }

    protected override void ConfigurarServicos(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            foreach (var d in services.Where(d =>
                         d.ServiceType == typeof(PortalDbContext) ||
                         d.ServiceType.ToString().Contains(nameof(PortalDbContext)) ||
                         d.ServiceType == typeof(DbContextOptions)).ToList())
                services.Remove(d);

            services.AddDbContext<PortalDbContext, PortalDbContextDeTeste>(o => o.UseInMemoryDatabase(_banco));
            services.AddTransient<IStartupFilter, RotaDeNegocioFilter>();
        });
    }

    private class RotaDeNegocioFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            app.UseEndpoints(e =>
            {
                e.MapPost("/api/teste/itens", async (PortalDbContext db, WorkspaceAtual ws, string texto) =>
                {
                    db.Set<ItemDeTeste>().Add(new ItemDeTeste { WorkspaceId = ws.Id, Texto = texto });
                    await db.SaveChangesAsync();
                    return Results.Ok();
                }).RequerWorkspace();

                e.MapGet("/api/teste/itens", async (PortalDbContext db) =>
                    Results.Ok(await db.Set<ItemDeTeste>().Select(i => i.Texto).ToListAsync())).RequerWorkspace();
            });
        };
    }
}

public class IsolamentoTests : IClassFixture<ApiComRotaDeNegocio>
{
    private readonly ApiComRotaDeNegocio _api;

    public IsolamentoTests(ApiComRotaDeNegocio api) => _api = api;

    private static async Task<Guid> CriarWorkspace(HttpClient c, string nome)
    {
        var r = await c.PostAsJsonAsync("/api/workspaces", new { nome });
        return (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Rota_de_negocio_sem_X_Workspace_Id_devolve_400()
    {
        using var client = _api.ClienteCom(Guid.NewGuid());

        using var resp = await client.GetAsync("/api/teste/itens");

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Rota_de_negocio_com_workspace_de_outro_usuario_ou_inexistente_devolve_404()
    {
        using var ana = _api.ClienteCom(Guid.NewGuid());
        var wsAna = await CriarWorkspace(ana, "Da Ana");

        using var beto = _api.ClienteCom(Guid.NewGuid(), workspace: wsAna);
        using var inexistente = _api.ClienteCom(Guid.NewGuid(), workspace: Guid.NewGuid());

        using var alheio = await beto.GetAsync("/api/teste/itens");
        using var nenhum = await inexistente.GetAsync("/api/teste/itens");

        Assert.Equal(HttpStatusCode.NotFound, alheio.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, nenhum.StatusCode);
    }

    [Fact]
    public async Task Query_filter_impede_que_dados_de_um_workspace_aparecam_no_outro()
    {
        var usuario = Guid.NewGuid();
        using var semWs = _api.ClienteCom(usuario);
        var ws1 = await CriarWorkspace(semWs, "Um");
        var ws2 = await CriarWorkspace(semWs, "Dois");

        using var c1 = _api.ClienteCom(usuario, workspace: ws1);
        using var c2 = _api.ClienteCom(usuario, workspace: ws2);
        Assert.Equal(HttpStatusCode.OK, (await c1.PostAsync("/api/teste/itens?texto=segredo-do-um", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c2.PostAsync("/api/teste/itens?texto=segredo-do-dois", null)).StatusCode);

        var itens1 = await c1.GetFromJsonAsync<List<string>>("/api/teste/itens");
        var itens2 = await c2.GetFromJsonAsync<List<string>>("/api/teste/itens");

        Assert.Equal(new[] { "segredo-do-um" }, itens1);
        Assert.Equal(new[] { "segredo-do-dois" }, itens2);
    }
}
