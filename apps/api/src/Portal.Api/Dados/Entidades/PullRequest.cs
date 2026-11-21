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
    public string Url { get; set; } = "";
    public DateTimeOffset? AtualizadaEm { get; set; }
    /// <summary>sucesso, falhou, rodando ou sem CI; "sem CI" até a primeira consulta bem-sucedida.</summary>
    public string StatusCi { get; set; } = "sem CI";
    public string? ShaUltimoCommit { get; set; }
    public bool Draft { get; set; }
    /// <summary>Logins dos revisores solicitados ainda pendentes.</summary>
    public List<string> RevisoresSolicitados { get; set; } = [];
    /// <summary>Nomes das equipes solicitadas ainda pendentes.</summary>
    public List<string> EquipesSolicitadas { get; set; } = [];
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
}
