namespace Portal.Api.Perfil;

/// <summary>
/// Dados da pessoa (não do workspace): o login do GitHub (filtra "Esperando você") e se a API exige a
/// verificação em duas etapas (D-013).
/// Chave = o <c>sub</c> do JWT; só a própria pessoa lê e muda o seu.
/// </summary>
public class PerfilUsuario
{
    public const int GithubLoginMaximo = 39;

    public Guid UsuarioId { get; set; }
    public string? GithubLogin { get; set; }

    /// <summary>Ligado pela própria pessoa (com token aal2): sem aal2 no JWT, as rotas autenticadas devolvem 403.</summary>
    public bool MfaExigido { get; set; }
    public DateTimeOffset AtualizadoEm { get; set; }
}
