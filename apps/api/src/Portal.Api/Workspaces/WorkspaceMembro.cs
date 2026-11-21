namespace Portal.Api.Workspaces;

public class WorkspaceMembro
{
    public Guid WorkspaceId { get; set; }

    /// <summary>O <c>sub</c> do JWT do Supabase.</summary>
    public Guid UsuarioId { get; set; }

    public string Papel { get; set; } = Papeis.Dono;

    /// <summary>E-mail do JWT no momento em que a pessoa entrou (criou o workspace ou aceitou o convite). Só para exibição.</summary>
    public string? Email { get; set; }
}

/// <summary>
/// Papéis no workspace (D-011). Admin, por enquanto, tem os mesmos poderes de membro: integrações,
/// convites e gestão de membros continuam só do dono.
/// </summary>
public static class Papeis
{
    public const string Dono = "dono";
    public const string Admin = "admin";
    public const string Membro = "membro";

    public static readonly string[] Todos = [Dono, Admin, Membro];
}
