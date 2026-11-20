using System.Security.Claims;

namespace Portal.Api.Auth;

/// <summary>Usuário da requisição, lido do <c>sub</c> e do <c>email</c> do JWT. Scoped.</summary>
public class UsuarioAtual
{
    public Guid Id { get; }
    public string? Email { get; }

    public UsuarioAtual(Guid id, string? email)
    {
        Id = id;
        Email = email;
    }

    public static UsuarioAtual De(ClaimsPrincipal? usuario)
    {
        var sub = usuario?.FindFirst("sub")?.Value;
        return new UsuarioAtual(Guid.TryParse(sub, out var id) ? id : Guid.Empty, usuario?.FindFirst("email")?.Value);
    }
}
