namespace Portal.Api.Dados.Entidades;

public class Deploy
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public Guid RepositorioId { get; set; }
    public string Titulo { get; set; } = "";
    public string Ambiente { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTimeOffset AgendadoPara { get; set; }
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
}
