namespace Portal.Api.Tests;

[Collection("postgres")]
public class DadosMigrationTests
{
    private readonly PostgresFixture _pg;

    public DadosMigrationTests(PostgresFixture pg) => _pg = pg;

    [Fact]
    public async Task Migration_aplica_do_zero_e_cria_as_tabelas()
    {
        var conexao = await _pg.NovoBancoAsync();
        Assert.Empty(await _pg.TabelasAsync(conexao));

        // Em Development a API aplica as migrations no startup.
        await using var api = new ApiFactory("Development", conexao);
        using var client = api.CreateClient();

        var tabelas = await _pg.TabelasAsync(conexao);
        Assert.Contains("workspaces", tabelas);
        Assert.Contains("workspace_membros", tabelas);
    }
}
