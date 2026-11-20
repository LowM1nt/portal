using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;

namespace Portal.Api.Tests;

/// <summary>Fábrica da API com ambiente e configuração controlados pelo teste.</summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    // Só alcançado em testes que nunca chegam ao banco (401, CORS).
    public const string ConexaoSemBanco = "Host=localhost;Port=1;Database=nenhum;Username=x;Password=x;Timeout=1";

    private readonly string _ambiente;
    private readonly string _conexao;
    private readonly string? _corsOrigem;

    public ApiFactory(string ambiente = "Testing", string conexao = ConexaoSemBanco, string? corsOrigem = null)
    {
        _ambiente = ambiente;
        _conexao = conexao;
        _corsOrigem = corsOrigem;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_ambiente);
        builder.UseSetting("ConnectionStrings:Portal", _conexao);
        builder.UseSetting("Jwt:ChaveTeste", TokenDeTeste.Chave);
        if (_corsOrigem is not null) builder.UseSetting("Cors:Origem", _corsOrigem);
        ConfigurarServicos(builder);
    }

    protected virtual void ConfigurarServicos(IWebHostBuilder builder)
    {
    }

    /// <summary>Aplica as migrations pela fábrica (fora de Development a API não migra sozinha).</summary>
    public async Task MigrarAsync()
    {
        using var escopo = Services.CreateScope();
        await escopo.ServiceProvider.GetRequiredService<PortalDbContext>().Database.MigrateAsync();
    }

    public HttpClient ClienteCom(Guid usuario, string? email = null, Guid? workspace = null)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TokenDeTeste.Gerar(usuario, email));
        if (workspace is not null) client.DefaultRequestHeaders.Add("X-Workspace-Id", workspace.ToString());
        return client;
    }
}

/// <summary>Fixture de classe (o xUnit exige um único construtor público, sem parâmetros).</summary>
public class ApiTesting : ApiFactory
{
    public ApiTesting() : base("Testing")
    {
    }
}

/// <summary>Um Postgres descartável (D-002) por execução; cada teste pega um banco novo dentro dele.</summary>
public class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();

    public Task InitializeAsync() => _container.StartAsync();

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public async Task<string> NovoBancoAsync()
    {
        var nome = "t" + Guid.NewGuid().ToString("N");
        await using (var conexao = new NpgsqlConnection(_container.GetConnectionString()))
        {
            await conexao.OpenAsync();
            await using var cmd = new NpgsqlCommand($"CREATE DATABASE {nome}", conexao);
            await cmd.ExecuteNonQueryAsync();
        }

        return new NpgsqlConnectionStringBuilder(_container.GetConnectionString()) { Database = nome }.ConnectionString;
    }

    public async Task<HashSet<string>> TabelasAsync(string conexao)
    {
        var tabelas = new HashSet<string>();
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", c);
        await using var leitor = await cmd.ExecuteReaderAsync();
        while (await leitor.ReadAsync()) tabelas.Add(leitor.GetString(0));
        return tabelas;
    }
}

[CollectionDefinition("postgres")]
public class PostgresCollection : ICollectionFixture<PostgresFixture>
{
}
