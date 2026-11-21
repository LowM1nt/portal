using Npgsql;

namespace Portal.Api.Tests.Dados;

/// <summary>
/// Auditoria 20/11: no Supabase, tabela do schema public sem RLS fica exposta pela API REST pública.
/// Toda tabela da API precisa de RLS ligado (sem políticas = ninguém de fora lê; a API é a dona e não é afetada).
/// Se uma migration nova criar tabela sem RLS, este teste falha.
/// </summary>
[Collection("postgres")]
public class RlsEmTodasAsTabelasTests
{
    private readonly PostgresFixture _pg;

    public RlsEmTodasAsTabelasTests(PostgresFixture pg) => _pg = pg;

    [Fact]
    public async Task Toda_tabela_do_schema_public_tem_rls_ligado()
    {
        var conexao = await _pg.NovoBancoAsync();
        using (var api = new ApiFactory("Testing", conexao)) await api.MigrarAsync();

        var semRls = new List<string>();
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity", c);
        await using var leitor = await cmd.ExecuteReaderAsync();
        while (await leitor.ReadAsync()) semRls.Add(leitor.GetString(0));

        Assert.True(semRls.Count == 0, "Tabelas sem RLS: " + string.Join(", ", semRls));
    }
}
