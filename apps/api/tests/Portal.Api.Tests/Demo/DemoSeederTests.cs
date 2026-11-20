using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Demo;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Demo;

[Collection("postgres")]
public class DemoSeederTests
{
    private readonly PostgresFixture _pg;

    public DemoSeederTests(PostgresFixture pg) => _pg = pg;

    private async Task<ApiFactory> NovaApiAsync()
    {
        var api = new ApiFactory("Testing", await _pg.NovoBancoAsync());
        await api.MigrarAsync();
        return api;
    }

    private static async Task SemearAsync(ApiFactory api)
    {
        using var escopo = api.Services.CreateScope();
        await DemoSeeder.SemearAsync(escopo.ServiceProvider.GetRequiredService<PortalDbContext>());
    }

    private static async Task<(int Workspaces, int Repositorios, int Deploys, List<string> Titulos)> FotoDoDemoAsync(ApiFactory api)
    {
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        return (
            await db.Workspaces.CountAsync(w => w.Id == DemoWorkspace.Id),
            await db.Repositorios.IgnoreQueryFilters().CountAsync(r => r.WorkspaceId == DemoWorkspace.Id),
            await db.Deploys.IgnoreQueryFilters().CountAsync(d => d.WorkspaceId == DemoWorkspace.Id),
            await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id)
                .OrderBy(d => d.Titulo).Select(d => d.Titulo).ToListAsync());
    }

    [Fact]
    public async Task Seeder_cria_o_workspace_de_demonstracao_com_deploys_ficticios_espalhados_por_semanas()
    {
        await using var api = await NovaApiAsync();

        await SemearAsync(api);

        var foto = await FotoDoDemoAsync(api);
        Assert.Equal(1, foto.Workspaces);
        Assert.True(foto.Repositorios >= 1);
        Assert.True(foto.Deploys >= 6, "esperava deploys fictícios suficientes para a demo");

        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var datas = await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id)
            .Select(d => d.AgendadoPara).ToListAsync();
        var semanas = datas.Select(d => (ISOWeek.GetYear(d.UtcDateTime), ISOWeek.GetWeekOfYear(d.UtcDateTime))).Distinct().Count();
        Assert.True(semanas >= 2, "os deploys devem se espalhar por mais de uma semana");
    }

    [Fact]
    public async Task Seeder_rodando_duas_vezes_nao_duplica_nada()
    {
        await using var api = await NovaApiAsync();

        await SemearAsync(api);
        var primeira = await FotoDoDemoAsync(api);
        await SemearAsync(api);
        var segunda = await FotoDoDemoAsync(api);

        Assert.Equal(primeira.Workspaces, segunda.Workspaces);
        Assert.Equal(primeira.Repositorios, segunda.Repositorios);
        Assert.Equal(primeira.Deploys, segunda.Deploys);
        Assert.Equal(primeira.Titulos, segunda.Titulos);
        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        Assert.Equal(primeira.Workspaces, await db.Workspaces.CountAsync());
    }

    [Fact]
    public async Task Seeder_nao_cria_nem_altera_dados_de_outro_workspace()
    {
        await using var api = await NovaApiAsync();
        var outro = Guid.NewGuid();
        Guid deployId;
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            db.Workspaces.Add(new Workspace { Id = outro, Nome = "Time real" });
            var repo = new Repositorio { WorkspaceId = outro, Nome = "meu-repo" };
            db.Repositorios.Add(repo);
            var d = new Deploy
            {
                WorkspaceId = outro, RepositorioId = repo.Id, Titulo = "Deploy real", Ambiente = "producao",
                Status = "agendado", AgendadoPara = new DateTimeOffset(2026, 11, 18, 12, 0, 0, TimeSpan.Zero),
            };
            db.Deploys.Add(d);
            await db.SaveChangesAsync();
            deployId = d.Id;
        }

        await SemearAsync(api);
        await SemearAsync(api);

        using var escopo2 = api.Services.CreateScope();
        var db2 = escopo2.ServiceProvider.GetRequiredService<PortalDbContext>();
        Assert.Equal(1, await db2.Repositorios.IgnoreQueryFilters().CountAsync(r => r.WorkspaceId == outro));
        var deploysDoOutro = await db2.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == outro).ToListAsync();
        var unico = Assert.Single(deploysDoOutro);
        Assert.Equal(deployId, unico.Id);
        Assert.Equal("Deploy real", unico.Titulo);
        Assert.Equal("agendado", unico.Status);
        Assert.Equal(1, await db2.Workspaces.CountAsync(w => w.Id == outro));
        Assert.Equal("Time real", (await db2.Workspaces.SingleAsync(w => w.Id == outro)).Nome);
    }

    private sealed class RelogioFixo(DateTimeOffset agora) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => agora;
    }

    [Fact]
    public async Task Seeder_reaproveita_a_demo_envelhecida_e_a_semana_atual_tem_deploys()
    {
        await using var api = await NovaApiAsync();
        using (var escopo = api.Services.CreateScope())
        {
            var passado = new RelogioFixo(DateTimeOffset.UtcNow.AddDays(-40));
            await DemoSeeder.SemearAsync(escopo.ServiceProvider.GetRequiredService<PortalDbContext>(), default, passado);
        }

        await SemearAsync(api);

        using var verif = api.Services.CreateScope();
        var db = verif.ServiceProvider.GetRequiredService<PortalDbContext>();
        var agora = DateTime.UtcNow;
        var ano = ISOWeek.GetYear(agora);
        var semana = ISOWeek.GetWeekOfYear(agora);
        var datas = await db.Deploys.IgnoreQueryFilters().Where(d => d.WorkspaceId == DemoWorkspace.Id)
            .Select(d => d.AgendadoPara).ToListAsync();
        Assert.Contains(datas, d => ISOWeek.GetYear(d.UtcDateTime) == ano && ISOWeek.GetWeekOfYear(d.UtcDateTime) == semana);
        Assert.Equal(1, await db.Workspaces.CountAsync(w => w.Id == DemoWorkspace.Id));
    }
}
