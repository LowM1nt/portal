namespace Portal.Api.Perfil;

/// <summary>
/// Dados da pessoa (não do workspace): hoje só o login do GitHub, usado para filtrar "Esperando você".
/// Chave = o <c>sub</c> do JWT; só a própria pessoa lê e muda o seu.
/// </summary>
public class PerfilUsuario
{
    public const int GithubLoginMaximo = 39;

    public Guid UsuarioId { get; set; }
    public string? GithubLogin { get; set; }
    public DateTimeOffset AtualizadoEm { get; set; }
}
