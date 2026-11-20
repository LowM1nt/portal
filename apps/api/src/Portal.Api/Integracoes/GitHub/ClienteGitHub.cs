using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Portal.Api.Integracoes.GitHub;

public record PrGitHub(int Numero, string Titulo, string Autor, string Url, DateTimeOffset? AtualizadaEm, string? Sha = null);

public static class StatusCi
{
    public const string Sucesso = "sucesso";
    public const string Falhou = "falhou";
    public const string Rodando = "rodando";
    public const string SemCi = "sem CI";
}

/// <summary>Status de CI de um commit e a cota restante da API depois da consulta.</summary>
public record ResultadoCi(string Status, int? LimiteRestante);

public enum TipoListagem { Completa, SemMudanca, LimiteAtingido }

/// <summary>Resultado de uma listagem. Só <see cref="TipoListagem.Completa"/> traz todas as páginas.</summary>
public record ResultadoListagem(
    TipoListagem Tipo,
    IReadOnlyList<PrGitHub> Prs,
    string? ETag,
    int Paginas,
    int? LimiteRestante,
    DateTimeOffset? LimiteReinicia);

/// <summary>O GitHub recusou o token (401).</summary>
public class TokenInvalidoException() : Exception("O token do GitHub é inválido ou expirou.");

public partial class ClienteGitHub
{
    public const int LimiteMinimo = 10;
    public const string Host = "api.github.com";

    private readonly HttpClient _http;

    public ClienteGitHub(HttpClient http)
    {
        _http = http;
        _http.BaseAddress ??= new Uri($"https://{Host}/");
        if (_http.DefaultRequestHeaders.UserAgent.Count == 0)
            _http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Portal", "1.0"));
        if (_http.DefaultRequestHeaders.Accept.Count == 0)
            _http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    }

    [GeneratedRegex(@"<[^>]+>\s*;\s*rel=""next""")]
    private static partial Regex ProximaPagina();

    public async Task<ResultadoListagem> ListarPrsAbertasAsync(string repo, string token, string? etag, CancellationToken ct)
    {
        var prs = new List<PrGitHub>();
        string? etagPrimeira = null;
        int? restante = null;
        DateTimeOffset? reinicia = null;

        for (var pagina = 1; ; pagina++)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get,
                $"repos/{repo}/pulls?state=open&per_page=100&page={pagina}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (pagina == 1 && !string.IsNullOrEmpty(etag))
                req.Headers.TryAddWithoutValidation("If-None-Match", etag);

            using var resp = await _http.SendAsync(req, ct);
            restante = LerInteiro(resp, "X-RateLimit-Remaining") ?? restante;
            reinicia = LerInteiro(resp, "X-RateLimit-Reset") is { } s ? DateTimeOffset.FromUnixTimeSeconds(s) : reinicia;

            if (resp.StatusCode == HttpStatusCode.Unauthorized) throw new TokenInvalidoException();
            if (resp.StatusCode == HttpStatusCode.NotModified && pagina == 1)
                return new(TipoListagem.SemMudanca, [], etag, 1, restante, reinicia);
            resp.EnsureSuccessStatusCode();

            if (pagina == 1) etagPrimeira = resp.Headers.ETag?.ToString();

            await using var corpo = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(corpo, cancellationToken: ct);
            foreach (var p in doc.RootElement.EnumerateArray()) prs.Add(Mapear(p));

            var temProxima = resp.Headers.TryGetValues("Link", out var links)
                && links.Any(l => ProximaPagina().IsMatch(l));
            if (!temProxima)
                return new(TipoListagem.Completa, prs, etagPrimeira, pagina, restante, reinicia);
            if (restante is { } r && r <= LimiteMinimo)
                return new(TipoListagem.LimiteAtingido, [], null, pagina, restante, reinicia);
        }
    }

    private static PrGitHub Mapear(JsonElement p) => new(
        p.GetProperty("number").GetInt32(),
        p.GetProperty("title").GetString() ?? "",
        p.TryGetProperty("user", out var u) && u.ValueKind == JsonValueKind.Object
            ? u.GetProperty("login").GetString() ?? "" : "",
        p.TryGetProperty("html_url", out var h) ? h.GetString() ?? "" : "",
        p.TryGetProperty("updated_at", out var a) && a.TryGetDateTimeOffset(out var d) ? d : null,
        p.TryGetProperty("head", out var hd) && hd.ValueKind == JsonValueKind.Object
            && hd.TryGetProperty("sha", out var sh) ? sh.GetString() : null);

    private static readonly string[] ConclusoesDeFalha = ["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"];

    /// <summary>Status combinado (commit statuses + check runs) do commit, nos 4 estados do portal.</summary>
    public async Task<ResultadoCi> ConsultarStatusCiAsync(string repo, string sha, string token, CancellationToken ct)
    {
        var (statuses, restante) = await LerArrayAsync($"repos/{repo}/commits/{sha}/status", "statuses", token, null, ct);
        var (checks, restante2) = await LerArrayAsync($"repos/{repo}/commits/{sha}/check-runs?per_page=100", "check_runs", token, restante, ct);

        if (statuses.Count == 0 && checks.Count == 0) return new(StatusCi.SemCi, restante2);

        var falhou = statuses.Any(s => s.state is "failure" or "error")
            || checks.Any(c => c.state == "completed" && c.conclusao is { } k && ConclusoesDeFalha.Contains(k));
        if (falhou) return new(StatusCi.Falhou, restante2);

        var rodando = statuses.Any(s => s.state == "pending") || checks.Any(c => c.state != "completed");
        return new(rodando ? StatusCi.Rodando : StatusCi.Sucesso, restante2);
    }

    private async Task<(List<(string? state, string? conclusao)> Itens, int? Restante)> LerArrayAsync(
        string caminho, string propriedade, string token, int? restanteAnterior, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, caminho);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var resp = await _http.SendAsync(req, ct);
        var restante = LerInteiro(resp, "X-RateLimit-Remaining") ?? restanteAnterior;
        if (resp.StatusCode == HttpStatusCode.Unauthorized) throw new TokenInvalidoException();
        resp.EnsureSuccessStatusCode();

        await using var corpo = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(corpo, cancellationToken: ct);
        var itens = new List<(string?, string?)>();
        if (doc.RootElement.TryGetProperty(propriedade, out var arr) && arr.ValueKind == JsonValueKind.Array)
            foreach (var i in arr.EnumerateArray())
            {
                var estado = (i.TryGetProperty("state", out var st) ? st.GetString() : null)
                    ?? (i.TryGetProperty("status", out var s2) ? s2.GetString() : null);
                var concl = i.TryGetProperty("conclusion", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
                itens.Add((estado, concl));
            }
        return (itens, restante);
    }

    private static int? LerInteiro(HttpResponseMessage r, string cabecalho) =>
        r.Headers.TryGetValues(cabecalho, out var v) && long.TryParse(v.FirstOrDefault(), out var n) ? (int)Math.Min(n, int.MaxValue) : null;
}
