namespace Portal.Api.Workspaces;

/// <summary>
/// Convite para entrar num workspace. O token em si nunca é guardado: só o SHA-256 dele (<see cref="TokenHash"/>).
/// Uso único: <see cref="UsadoEm"/> é preenchido por um UPDATE condicional, então dois aceites simultâneos não passam.
/// </summary>
public class Convite
{
    public const int EmailMaximo = 254;

    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }

    /// <summary>Sempre em minúsculas (comparação sem diferenciar maiúsculas).</summary>
    public string Email { get; set; } = "";

    public string Papel { get; set; } = Papeis.Membro;
    public byte[] TokenHash { get; set; } = [];
    public Guid CriadoPor { get; set; }
    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset ExpiraEm { get; set; }
    public DateTimeOffset? UsadoEm { get; set; }
    public Guid? UsadoPor { get; set; }
}
