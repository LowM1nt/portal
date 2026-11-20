namespace Portal.Api.Dados.Entidades;

public class Repositorio
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Nome { get; set; } = "";
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
}
