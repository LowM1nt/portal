using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace Portal.Api.Tests;

public class AuthTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthTests(ApiFactory factory) => _factory = factory;

    private static readonly (HttpMethod Metodo, string Rota)[] Rotas =
    {
        (HttpMethod.Get, "/api/me"),
        (HttpMethod.Post, "/api/workspaces"),
        (HttpMethod.Get, $"/api/workspaces/{Guid.NewGuid()}"),
    };


    private static async Task<List<HttpStatusCode>> Todas(HttpClient client)
    {
        var codigos = new List<HttpStatusCode>();
        foreach (var (metodo, rota) in Rotas)
        {
            using var req = new HttpRequestMessage(metodo, rota);
            if (metodo == HttpMethod.Post) req.Content = JsonContent.Create(new { nome = "Time" });
            using var resp = await client.SendAsync(req);
            codigos.Add(resp.StatusCode);
        }
        return codigos;
    }

    private async Task<List<HttpStatusCode>> ComToken(string? token)
    {
        using var client = _factory.CreateClient();
        if (token is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await Todas(client);
    }

    [Fact]
    public async Task Sem_token_todas_as_rotas_devolvem_401()
    {
        Assert.All(await ComToken(null), c => Assert.Equal(HttpStatusCode.Unauthorized, c));
    }

    [Fact]
    public async Task Token_expirado_devolve_401()
    {
        var token = TokenDeTeste.Gerar(Guid.NewGuid(), "a@b.com", expirado: true);
        Assert.All(await ComToken(token), c => Assert.Equal(HttpStatusCode.Unauthorized, c));
    }

    [Fact]
    public async Task Token_assinado_por_outra_chave_devolve_401()
    {
        var token = TokenDeTeste.Gerar(Guid.NewGuid(), "a@b.com", chave: TokenDeTeste.OutraChave);
        Assert.All(await ComToken(token), c => Assert.Equal(HttpStatusCode.Unauthorized, c));
    }
}
