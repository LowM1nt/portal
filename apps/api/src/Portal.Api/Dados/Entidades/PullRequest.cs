namespace Portal.Api.Dados.Entidades;

public class PullRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Guid RepositorioId { get; set; }
    public int Numero { get; set; }
    public string Titulo { get; set; } = "";
    public string Autor { get; set; } = "";
    public string Estado { get; set; } = "";
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
}
