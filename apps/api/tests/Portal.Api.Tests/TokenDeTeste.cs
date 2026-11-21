using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Portal.Api.Tests;

/// <summary>Assina tokens no formato do Supabase com a chave simétrica de teste (ambiente Testing).</summary>
public static class TokenDeTeste
{
    public const string Chave = "chave-simetrica-de-teste-com-pelo-menos-32-bytes!!";
    public const string OutraChave = "outra-chave-simetrica-de-teste-32-bytes-ou-mais!";

    /// <param name="aal">Nível da sessão como o Supabase manda: aal1 (só senha) ou aal2 (senha + código); null = sem a claim.</param>
    public static string Gerar(Guid sub, string? email = null, string? chave = null, bool expirado = false, string? aal = "aal1")
    {
        var agora = DateTime.UtcNow;
        // notBefore sempre antes de expires; expirado = os dois no passado.
        var notBefore = expirado ? agora.AddHours(-2) : agora.AddMinutes(-1);
        var expires = expirado ? agora.AddHours(-1) : agora.AddHours(1);

        var claims = new List<Claim> { new("sub", sub.ToString()) };
        if (email is not null) claims.Add(new Claim("email", email));
        if (aal is not null) claims.Add(new Claim("aal", aal));

        var credenciais = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(chave ?? Chave)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            audience: "authenticated",
            claims: claims,
            notBefore: notBefore,
            expires: expires,
            signingCredentials: credenciais);

        return new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false }.WriteToken(token);
    }
}
