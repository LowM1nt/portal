using Microsoft.AspNetCore.DataProtection;
using Portal.Api.Integracoes.GitHub;
using Xunit;

namespace Portal.Api.Tests.Integracoes;

// Um token salvo antes de um reinício precisa continuar legível depois:
// dois provedores criados do zero, apontando para a mesma pasta de chaves, se entendem.
public class ChavesPersistidasTests
{
    [Fact]
    public void Token_cifrado_continua_legivel_depois_de_reiniciar()
    {
        var pasta = Directory.CreateTempSubdirectory("chaves-dp-");
        try
        {
            var antes = DataProtectionProvider.Create(pasta, c => c.SetApplicationName("portal"))
                .CreateProtector(GitHubConfigService.Proposito);
            var cifrado = antes.Protect("token-de-teste-0123456789-wxyz");

            var depois = DataProtectionProvider.Create(pasta, c => c.SetApplicationName("portal"))
                .CreateProtector(GitHubConfigService.Proposito);

            Assert.Equal("token-de-teste-0123456789-wxyz", depois.Unprotect(cifrado));
        }
        finally { pasta.Delete(recursive: true); }
    }
}
