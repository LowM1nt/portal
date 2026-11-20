namespace Portal.Api.Workspaces;

public class Workspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public const int NomeMaximo = 100;

    public string Nome { get; set; } = "";

    /// <summary>Preenchido só no workspace pessoal; o índice único impede dois por usuário.</summary>
    public Guid? PessoalDe { get; set; }

    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
}
