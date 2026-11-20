using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Portal.Api.Integracoes.GitHub;

public record PrGitHub(int Numero, string Titulo, string Autor, string Url, DateTimeOffset? AtualizadaEm);

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
        p.TryGetProperty("updated_at", out var a) && a.TryGetDateTimeOffset(out var d) ? d : null);

    private static int? LerInteiro(HttpResponseMessage r, string cabecalho) =>
        r.Headers.TryGetValues(cabecalho, out var v) && long.TryParse(v.FirstOrDefault(), out var n) ? (int)Math.Min(n, int.MaxValue) : null;
}
