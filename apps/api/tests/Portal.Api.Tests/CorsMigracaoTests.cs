using System.Net;

namespace Portal.Api.Tests;

[Collection("postgres")]
public class CorsMigracaoTests
{
    private readonly PostgresFixture _pg;

    public CorsMigracaoTests(PostgresFixture pg) => _pg = pg;

    private static async Task<string?> OrigemPermitida(ApiFactory api, string origem)
    {
        using var client = api.CreateClient();
        using var req = new HttpRequestMessage(HttpMethod.Get, "/health");
        req.Headers.Add("Origin", origem);
        using var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return resp.Headers.TryGetValues("Access-Control-Allow-Origin", out var v) ? v.Single() : null;
    }

    [Fact]
    public async Task Cors_padrao_so_permite_a_origem_do_web_local()
    {
        await using var api = new ApiFactory();
        Assert.Equal("http://localhost:5173", await OrigemPermitida(api, "http://localhost:5173"));
        Assert.Null(await OrigemPermitida(api, "http://outro-site.com"));
    }

    [Fact]
    public async Task Cors_usa_a_origem_configurada()
    {
        await using var api = new ApiFactory(corsOrigem: "https://portal.exemplo.com");
        Assert.Equal("https://portal.exemplo.com", await OrigemPermitida(api, "https://portal.exemplo.com"));
        Assert.Null(await OrigemPermitida(api, "http://localhost:5173"));
    }

    [Theory]
    [InlineData("Testing")]
    [InlineData("Production")]
    public async Task Fora_de_Development_nenhuma_migration_e_aplicada(string ambiente)
    {
        var conexao = await _pg.NovoBancoAsync();

        await using var api = new ApiFactory(ambiente, conexao);
        using var client = api.CreateClient();
        using var _ = await client.GetAsync("/health");

        Assert.Empty(await _pg.TabelasAsync(conexao));
    }
}
