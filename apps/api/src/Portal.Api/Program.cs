using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Auth;
using Portal.Api.Bugs;
using Portal.Api.Dados;
using Portal.Api.Demo;
using Portal.Api.Deploys;
using Portal.Api.Metricas;
using Portal.Api.Perfil;
using Portal.Api.Revisoes;
using Portal.Api.Roadmap;
using Portal.Api.Seguranca;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Workspaces;

var builder = WebApplication.CreateBuilder(args);

// A configuração é lida de forma tardia (dentro dos callbacks) para valer o que o host final define.
builder.Services.AddDbContext<PortalDbContext>((sp, o) =>
    o.UseNpgsql(sp.GetRequiredService<IConfiguration>().GetConnectionString("Portal")));
builder.Services.AddScoped<WorkspaceAtual>();
builder.Services.AddScoped<WorkspaceService>();
builder.Services.AddScoped<DeploysService>();
builder.Services.AddScoped<RevisoesService>();
builder.Services.AddScoped<RoadmapService>();
builder.Services.AddScoped<BugsService>();
builder.Services.AddScoped<GitHubConfigService>();
builder.Services.AddScoped<MembrosService>();
builder.Services.AddScoped<MetricasService>();
builder.Services.AddScoped<PerfilService>();
// Sem provedor de e-mail ainda: o convite devolve o link para o dono copiar.
builder.Services.AddSingleton<IEnviadorDeEmail, EnviadorDeEmailNulo>();
builder.Services.AddHttpClient<ClienteGitHub>();
builder.Services.AddSingleton<EtagsGitHub>();
builder.Services.AddScoped<ImportadorDePrs>();
builder.Services.AddSingleton(TimeProvider.System);
// Fora do ambiente Testing, para não rodar nos testes de integração.
if (!builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddHostedService<SincronizacaoGitHub>();
// Chaves do Data Protection persistidas: sem isso, cada reinício do container gera chaves novas e os
// tokens já salvos (GitHub) ficam ilegíveis. Com banco, ficam no Postgres (tabela chaves_protecao_dados),
// que sobrevive a reinícios do Render; a pasta (DataProtection:PastaDasChaves) é só para rodar sem banco.
var protecaoDeDados = builder.Services.AddDataProtection().SetApplicationName("portal");
var pastaDasChaves = builder.Configuration["DataProtection:PastaDasChaves"];
if (!string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("Portal")))
    protecaoDeDados.PersistKeysToDbContext<PortalDbContext>();
else if (!string.IsNullOrWhiteSpace(pastaDasChaves))
    protecaoDeDados.PersistKeysToFileSystem(new DirectoryInfo(pastaDasChaves));
builder.Services.AddAutenticacaoSupabase();
builder.Services.AddSegurancaHttp();
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = SegurancaExtensions.CorpoMaximoBytes);

// CORS: só a origem do web (Cors:Origem; padrão = Vite local).
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>().Configure<IConfiguration>((o, config) =>
    o.AddDefaultPolicy(p => p
        .WithOrigins(config["Cors:Origem"] ?? "http://localhost:5173")
        .AllowAnyHeader()
        .AllowAnyMethod()));

var app = builder.Build();

// Migrations no startup só em Development; em produção, `dotnet ef database update` à mão.
if (app.Environment.IsDevelopment() && !string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("Portal")))
{
    using var escopo = app.Services.CreateScope();
    escopo.ServiceProvider.GetRequiredService<PortalDbContext>().Database.Migrate();
}

var demoLigada = app.Configuration.GetValue<bool>("Demo:Habilitada");
if (demoLigada && !string.IsNullOrWhiteSpace(app.Configuration.GetConnectionString("Portal")))
{
    using var escopo = app.Services.CreateScope();
    await DemoSeeder.SemearAsync(escopo.ServiceProvider.GetRequiredService<PortalDbContext>());
}

app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    app.UseHsts();
app.UseCors();
app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapWorkspaces();
app.MapDeploys();
app.MapRevisoes();
app.MapRoadmap();
app.MapBugs();
app.MapGitHub();
app.MapMembros();
app.MapMetricas();
if (demoLigada) app.MapDemo();

app.Run();

// Exposto para os testes de integração (WebApplicationFactory<Program>).
public partial class Program
{
}
