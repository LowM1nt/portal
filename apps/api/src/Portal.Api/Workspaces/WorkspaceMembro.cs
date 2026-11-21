namespace Portal.Api.Workspaces;

public class WorkspaceMembro
{
    public Guid WorkspaceId { get; set; }

    /// <summary>O <c>sub</c> do JWT do Supabase.</summary>
    public Guid UsuarioId { get; set; }

    public string Papel { get; set; } = Papeis.Dono;
}

public static class Papeis
{
    public const string Dono = "dono";
    public const string Membro = "membro";
}
