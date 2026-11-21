namespace Portal.Api.Bugs;

public enum SeveridadeBug { Baixa, Media, Alta, Critica }

public enum OrigemBug { Manual, Discord }

public enum StatusBug { ATriar, Aberto, EmAndamento, Resolvido, Descartado }

/// <summary>Conversão entre os enums e os textos da API/banco (baixa, a_triar, em_andamento...).</summary>
public static class TextoBug
{
    public static string Para(SeveridadeBug v) => v switch
    {
        SeveridadeBug.Baixa => "baixa",
        SeveridadeBug.Media => "media",
        SeveridadeBug.Alta => "alta",
        _ => "critica",
    };

    public static string Para(OrigemBug v) => v == OrigemBug.Discord ? "discord" : "manual";

    public static string Para(StatusBug v) => v switch
    {
        StatusBug.ATriar => "a_triar",
        StatusBug.Aberto => "aberto",
        StatusBug.EmAndamento => "em_andamento",
        StatusBug.Resolvido => "resolvido",
        _ => "descartado",
    };

    public static SeveridadeBug? Severidade(string? t) => t?.Trim() switch
    {
        "baixa" => SeveridadeBug.Baixa,
        "media" => SeveridadeBug.Media,
        "alta" => SeveridadeBug.Alta,
        "critica" => SeveridadeBug.Critica,
        _ => null,
    };

    public static OrigemBug? Origem(string? t) => t?.Trim() switch
    {
        "manual" => OrigemBug.Manual,
        "discord" => OrigemBug.Discord,
        _ => null,
    };

    public static StatusBug? Status(string? t) => t?.Trim() switch
    {
        "a_triar" => StatusBug.ATriar,
        "aberto" => StatusBug.Aberto,
        "em_andamento" => StatusBug.EmAndamento,
        "resolvido" => StatusBug.Resolvido,
        "descartado" => StatusBug.Descartado,
        _ => null,
    };
}

public class Bug
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Titulo { get; set; } = "";
    public string Relato { get; set; } = "";
    public string Passos { get; set; } = "";
    public string Esperado { get; set; } = "";
    public string Obtido { get; set; } = "";
    public SeveridadeBug Severidade { get; set; } = SeveridadeBug.Media;
    public OrigemBug Origem { get; set; } = OrigemBug.Manual;
    public StatusBug Status { get; set; } = StatusBug.ATriar;
    public DateTimeOffset CriadoEm { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset AtualizadoEm { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Nome visível de quem relatou fora do portal (Discord). Nulo nos bugs manuais.</summary>
    public string? Autor { get; set; }

    /// <summary>Id da mensagem de origem (Discord). Único por workspace: a mesma mensagem não vira dois bugs.</summary>
    public string? MensagemExternaId { get; set; }
}
