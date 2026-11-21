using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;

namespace Portal.Api.Bugs.Extracao;

public static class StatusSugestao
{
    /// <summary>Na fila, esperando a IA (ou uma nova tentativa).</summary>
    public const string Pendente = "pendente";

    /// <summary>A IA respondeu dentro do schema; aguarda a triagem humana.</summary>
    public const string Pronta = "pronta";

    /// <summary>Não deu (resposta fora do formato, chave inválida, IA fora após as retentativas). O bug segue só com o relato.</summary>
    public const string Falhou = "falhou";

    /// <summary>A chave foi removida antes do processamento: nada foi enviado à IA.</summary>
    public const string Cancelada = "cancelada";

    public const string Aprovada = "aprovada";
    public const string Ajustada = "ajustada";
    public const string Descartada = "descartada";
}

/// <summary>
/// O que a IA sugeriu para um bug (P-026), guardado à parte do bug: os campos do bug são o que o humano escreveu/confirmou;
/// isto é só sugestão. Uma por bug.
/// </summary>
public class SugestaoIa
{
    public Guid BugId { get; set; }
    public Guid WorkspaceId { get; set; }
    public string Status { get; set; } = StatusSugestao.Pendente;
    public int Tentativas { get; set; }
    public DateTimeOffset ProximaTentativaEm { get; set; }
    public string Passos { get; set; } = "";
    public string Esperado { get; set; } = "";
    public string Obtido { get; set; } = "";
    public string Ambiente { get; set; } = "";
    public string? Severidade { get; set; }
    public string? Area { get; set; }
    public int? Confianca { get; set; }
    public string[] Evidencias { get; set; } = [];
    public string? Erro { get; set; }
    public DateTimeOffset CriadoEm { get; set; }
    public DateTimeOffset AtualizadoEm { get; set; }
}

/// <summary>Põe o bug na fila de extração quando o workspace tem chave de IA (D-007: sem chave, nada é enviado).</summary>
public static class FilaDeExtracao
{
    public static Task<bool> TemChaveAsync(PortalDbContext db, Guid workspaceId, CancellationToken ct) =>
        db.Set<ConfiguracaoIa>().IgnoreQueryFilters().AnyAsync(c => c.WorkspaceId == workspaceId, ct);

    public static void Enfileirar(PortalDbContext db, Bug bug, DateTimeOffset agora) =>
        db.Add(new SugestaoIa
        {
            BugId = bug.Id,
            WorkspaceId = bug.WorkspaceId,
            Status = StatusSugestao.Pendente,
            ProximaTentativaEm = agora,
            CriadoEm = agora,
            AtualizadoEm = agora,
        });

    public static async Task EnfileirarSeTiverChaveAsync(PortalDbContext db, Bug bug, DateTimeOffset agora, CancellationToken ct)
    {
        if (await TemChaveAsync(db, bug.WorkspaceId, ct)) Enfileirar(db, bug, agora);
    }
}
