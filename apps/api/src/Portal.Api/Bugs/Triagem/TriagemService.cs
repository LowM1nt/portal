using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Bugs.Extracao;
using Portal.Api.Dados;
using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Bugs.Triagem;

public record SugestaoTriagem(
    string Status, string? Severidade, string? Area, string Passos, string Esperado, string Obtido, string Ambiente,
    int? Confianca, string[] Evidencias, string? Erro);

/// <summary>Bug parecido no mesmo workspace (similaridade simples de palavras de título e relato, 0–100).</summary>
public record DuplicadoProvavel(Guid BugId, string Titulo, int Similaridade);

public record ItemTriagem(
    Guid BugId, string Titulo, string Relato, string Origem, string? Autor, string Severidade, DateTimeOffset CriadoEm,
    SugestaoTriagem? Sugestao, DuplicadoProvavel? PossivelDuplicado);

public record TriagemPedido(string? Acao, string? Severidade);

public record TriagemResultado(BugResposta Bug, SugestaoTriagem? Sugestao);

/// <summary>Base da triagem com IA (lote D): fila de bugs "a triar" com a sugestão e as ações aprovar/ajustar/descartar.</summary>
public class TriagemService
{
    public const int ItensMaximos = 100;

    /// <summary>Quantos bugs recentes do workspace entram na comparação de duplicados.</summary>
    public const int CandidatosMaximos = 500;

    /// <summary>Trecho do relato usado na comparação.</summary>
    public const int TrechoComparado = 1000;

    public const int SimilaridadeMinima = 50;

    private readonly PortalDbContext _db;
    private readonly TimeProvider _relogio;

    public TriagemService(PortalDbContext db, TimeProvider relogio)
    {
        _db = db;
        _relogio = relogio;
    }

    private static SugestaoTriagem? Mapear(SugestaoIa? s) => s is null
        ? null
        : new(s.Status, s.Severidade, s.Area, s.Passos, s.Esperado, s.Obtido, s.Ambiente, s.Confianca, s.Evidencias, s.Erro);

    public async Task<List<ItemTriagem>> ListarAsync(CancellationToken ct)
    {
        var bugs = await _db.Bugs.Where(b => b.Status == StatusBug.ATriar)
            .OrderByDescending(b => b.CriadoEm).ThenBy(b => b.Id)
            .Take(ItensMaximos)
            .ToListAsync(ct);
        if (bugs.Count == 0) return [];

        var ids = bugs.Select(b => b.Id).ToList();
        var sugestoes = await _db.Set<SugestaoIa>().Where(s => ids.Contains(s.BugId)).ToDictionaryAsync(s => s.BugId, ct);

        var candidatos = (await _db.Bugs.Where(b => b.Status != StatusBug.Descartado)
                .OrderByDescending(b => b.CriadoEm)
                .Take(CandidatosMaximos)
                .Select(b => new { b.Id, b.Titulo, Trecho = b.Relato.Substring(0, TrechoComparado) })
                .ToListAsync(ct))
            .Select(c => (Id: c.Id, Nome: c.Titulo, PalavrasTitulo: Similaridade.Palavras(c.Titulo),
                PalavrasTudo: Similaridade.Palavras(c.Titulo + " " + c.Trecho)))
            .ToList();

        return bugs.Select(b =>
        {
            var titulo = Similaridade.Palavras(b.Titulo);
            var tudo = Similaridade.Palavras(b.Titulo + " " + (b.Relato.Length > TrechoComparado ? b.Relato[..TrechoComparado] : b.Relato));
            var melhor = candidatos.Where(c => c.Id != b.Id)
                .Select(c => (c.Id, c.Nome, Nota: Similaridade.Nota(titulo, tudo, c.PalavrasTitulo, c.PalavrasTudo)))
                .OrderByDescending(c => c.Nota).ThenBy(c => c.Id)
                .FirstOrDefault();
            var duplicado = melhor.Nota >= SimilaridadeMinima ? new DuplicadoProvavel(melhor.Id, melhor.Nome, melhor.Nota) : null;

            return new ItemTriagem(b.Id, b.Titulo, b.Relato, TextoBug.Para(b.Origem), b.Autor, TextoBug.Para(b.Severidade), b.CriadoEm,
                Mapear(sugestoes.GetValueOrDefault(b.Id)), duplicado);
        }).ToList();
    }

    public async Task<Resultado<TriagemResultado>> AgirAsync(Guid bugId, TriagemPedido pedido, CancellationToken ct)
    {
        var acao = pedido.Acao?.Trim().ToLowerInvariant();
        if (acao is not ("aprovar" or "ajustar" or "descartar"))
            return Erro(ResultadoTipo.Invalido, "Ação inválida. Use aprovar, ajustar ou descartar.");

        var bug = await _db.Bugs.FirstOrDefaultAsync(b => b.Id == bugId, ct);
        if (bug is null) return new(ResultadoTipo.NaoEncontrado);
        if (bug.Status != StatusBug.ATriar) return Erro(ResultadoTipo.Conflito, "Este bug já foi triado.");

        var sugestao = await _db.Set<SugestaoIa>().FirstOrDefaultAsync(s => s.BugId == bugId, ct);
        var agora = _relogio.GetUtcNow();

        switch (acao)
        {
            case "aprovar":
                if (sugestao is not { Status: StatusSugestao.Pronta } || TextoBug.Severidade(sugestao.Severidade) is not { } sugerida)
                    return Erro(ResultadoTipo.Conflito, "Não há sugestão da IA pronta para aprovar.");
                bug.Severidade = sugerida;
                bug.Status = StatusBug.EmAndamento;
                sugestao.Status = StatusSugestao.Aprovada;
                break;

            case "ajustar":
                if (TextoBug.Severidade(pedido.Severidade) is not { } escolhida)
                    return Erro(ResultadoTipo.Invalido, "Severidade inválida. Use baixa, media, alta ou critica.");
                bug.Severidade = escolhida;
                bug.Status = StatusBug.EmAndamento;
                if (sugestao is { Status: StatusSugestao.Pronta }) sugestao.Status = StatusSugestao.Ajustada;
                break;

            default:
                if (sugestao is not { Status: StatusSugestao.Pronta or StatusSugestao.Falhou })
                    return Erro(ResultadoTipo.Conflito, "Não há sugestão da IA para descartar.");
                sugestao.Status = StatusSugestao.Descartada;
                break;
        }

        bug.AtualizadoEm = agora;
        if (sugestao is not null) sugestao.AtualizadoEm = agora;
        await _db.SaveChangesAsync(ct);

        var resposta = new BugResposta(bug.Id, bug.Titulo, bug.Relato, bug.Passos, bug.Esperado, bug.Obtido,
            TextoBug.Para(bug.Severidade), TextoBug.Para(bug.Origem), TextoBug.Para(bug.Status), bug.CriadoEm, bug.AtualizadoEm, bug.Autor);
        return new(ResultadoTipo.Ok, new TriagemResultado(resposta, Mapear(sugestao)));
    }

    private static Resultado<TriagemResultado> Erro(ResultadoTipo tipo, string erro) => new(tipo, Erro: erro);
}

/// <summary>Similaridade por conjunto de palavras (Jaccard), sem acento nem caixa, ignorando palavras curtas e comuns.</summary>
public static class Similaridade
{
    private static readonly HashSet<string> Comuns =
    [
        "que", "com", "para", "por", "uma", "nos", "nas", "dos", "das", "não", "nao", "mas", "quando", "como", "está", "esta",
        "isso", "ele", "ela", "foi", "ser", "tem", "the", "and", "bug", "erro",
    ];

    public static HashSet<string> Palavras(string texto)
    {
        var semAcento = new StringBuilder(texto.Length);
        foreach (var c in texto.ToLowerInvariant().Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                semAcento.Append(char.IsLetterOrDigit(c) ? c : ' ');

        return semAcento.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(p => p.Length >= 3 && !Comuns.Contains(p))
            .ToHashSet();
    }

    public static double Jaccard(HashSet<string> a, HashSet<string> b)
    {
        if (a.Count == 0 || b.Count == 0) return 0;
        var comum = a.Count(b.Contains);
        return (double)comum / (a.Count + b.Count - comum);
    }

    /// <summary>0–100: 60% título × título, 40% (título + relato) × (título + relato).</summary>
    public static int Nota(HashSet<string> tituloA, HashSet<string> tudoA, HashSet<string> tituloB, HashSet<string> tudoB) =>
        (int)Math.Round(100 * (0.6 * Jaccard(tituloA, tituloB) + 0.4 * Jaccard(tudoA, tudoB)));
}

public static class TriagemEndpoints
{
    public static void MapTriagem(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/triagem").RequerWorkspace();

        api.MapGet("", async (TriagemService servico, CancellationToken ct) => Results.Ok(await servico.ListarAsync(ct)));

        api.MapPost("/{bugId:guid}", async (Guid bugId, TriagemPedido pedido, TriagemService servico, CancellationToken ct) =>
        {
            var r = await servico.AgirAsync(bugId, pedido, ct);
            return r.Tipo switch
            {
                ResultadoTipo.Ok => Results.Ok(r.Valor),
                ResultadoTipo.NaoEncontrado => Results.NotFound(),
                ResultadoTipo.Conflito => Results.Conflict(new { erro = r.Erro }),
                _ => Results.BadRequest(new { erro = r.Erro }),
            };
        });
    }
}
