namespace Portal.Api.Integracoes.GitHub;

/// <summary>Configuração do GitHub de um workspace (D-004). Um registro por workspace.</summary>
public class ConfiguracaoGitHub
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string TokenCriptografado { get; set; } = "";
    public string FinalToken { get; set; } = "";
    public string[] Repositorios { get; set; } = [];
    public DateTimeOffset ConfiguradoEm { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UltimaSincronizacao { get; set; }
    public string? UltimoErro { get; set; }
}
