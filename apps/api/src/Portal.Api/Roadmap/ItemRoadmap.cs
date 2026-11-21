namespace Portal.Api.Roadmap;

public class ItemRoadmap
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Titulo { get; set; } = "";
    public string? Descricao { get; set; }
    public string Status { get; set; } = "ideia";
    public DateOnly? Prazo { get; set; }
    public int Progresso { get; set; }
    public Guid? DeployId { get; set; }
    public Guid? PullRequestId { get; set; }
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset AtualizadoEm { get; set; } = DateTimeOffset.UtcNow;
}
