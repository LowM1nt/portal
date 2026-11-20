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

        await using var api = new ApiFactory("Testing", conexao);
        await api.MigrarAsync();

        var tabelas = await _pg.TabelasAsync(conexao);
        Assert.Contains("workspaces", tabelas);
        Assert.Contains("workspace_membros", tabelas);
    }
}
