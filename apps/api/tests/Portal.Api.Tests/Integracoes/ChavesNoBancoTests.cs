using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Dados;
using Portal.Api.Integracoes.GitHub;

namespace Portal.Api.Tests.Integracoes;

/// <summary>
/// Auditoria 20/11: no Render free o disco some a cada reinício. Com as chaves no Postgres, um token cifrado
/// por uma instância da API continua legível por outra (reinício ou várias réplicas) que usa o mesmo banco.
/// </summary>
[Collection("postgres")]
public class ChavesNoBancoTests
{
    private readonly PostgresFixture _pg;

    public ChavesNoBancoTests(PostgresFixture pg) => _pg = pg;

    [Fact]
    public async Task Token_cifrado_continua_legivel_em_outra_instancia_da_api()
    {
        var conexao = await _pg.NovoBancoAsync();
        string cifrado;
        using (var antes = new ApiFactory("Testing", conexao))
        {
            await antes.MigrarAsync();
            cifrado = antes.Services.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector(GitHubConfigService.Proposito).Protect("token-de-teste-0123456789-wxyz");
        }

        using var depois = new ApiFactory("Testing", conexao);
        var protetor = depois.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(GitHubConfigService.Proposito);
        Assert.Equal("token-de-teste-0123456789-wxyz", protetor.Unprotect(cifrado));

        using var escopo = depois.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        Assert.True(await db.DataProtectionKeys.CountAsync() >= 1);
    }
}
