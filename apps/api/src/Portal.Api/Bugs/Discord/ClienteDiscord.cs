using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Portal.Api.Bugs.Discord;

/// <summary>
/// Leitura do canal pela API REST do Discord (v10), com o token do bot (<c>Authorization: Bot ...</c>).
/// Respeita o rate limit: 429 devolve o <c>Retry-After</c>; balde zerado (<c>X-RateLimit-Remaining: 0</c>) devolve o
/// <c>X-RateLimit-Reset-After</c>. Nenhuma exceção carrega o token.
/// </summary>
public class ClienteDiscord : ICanalDeBugs
{
    public const string Host = "discord.com";
    public const int Limite = 100;

    /// <summary>Teto de espera aceito de um Retry-After (evita travar a captação por um valor absurdo).</summary>
    public static readonly TimeSpan EsperaMaxima = TimeSpan.FromHours(1);

    private readonly HttpClient _http;

    public ClienteDiscord(HttpClient http)
    {
        _http = http;
        _http.BaseAddress ??= new Uri($"https://{Host}/api/v10/");
        if (_http.DefaultRequestHeaders.UserAgent.Count == 0)
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordBot (https://github.com/LowM1nt/portal, 1.0)");
    }

    public OrigemBug Origem => OrigemBug.Discord;

    public int PorLeitura => Limite;

    public async Task<LeituraDoCanal> LerDepoisDeAsync(string token, string canalId, string depoisDe, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get,
            $"channels/{Uri.EscapeDataString(canalId)}/messages?after={Uri.EscapeDataString(depoisDe)}&limit={Limite}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bot", token);

        using var resp = await _http.SendAsync(req, ct);
        if (resp.StatusCode == HttpStatusCode.TooManyRequests)
            return new(TipoLeitura.LimiteAtingido, [], await RetryAfterAsync(resp, ct));
        if (resp.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return new(TipoLeitura.AcessoNegado, []);
        if (resp.StatusCode == HttpStatusCode.NotFound)
            return new(TipoLeitura.CanalNaoEncontrado, []);
        if (!resp.IsSuccessStatusCode)
            return new(TipoLeitura.Erro, []);

        await using var corpo = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(corpo, cancellationToken: ct);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return new(TipoLeitura.Erro, []);

        var mensagens = doc.RootElement.EnumerateArray()
            .Select(Mapear)
            .OfType<MensagemDoCanal>()
            .OrderBy(m => Snowflake.Valor(m.Id))
            .ToList();

        TimeSpan? esperar = Cabecalho(resp, "X-RateLimit-Remaining") == "0" ? Segundos(Cabecalho(resp, "X-RateLimit-Reset-After")) : null;
        return new(TipoLeitura.Ok, mensagens, esperar);
    }

    // Tipos 0 (DEFAULT) e 19 (REPLY) são mensagens de gente; os outros (entrou no servidor, fixou...) contam só para o cursor.
    private static MensagemDoCanal? Mapear(JsonElement m)
    {
        if (m.ValueKind != JsonValueKind.Object || !m.TryGetProperty("id", out var idEl) || idEl.GetString() is not { } id
            || !Snowflake.Valido(id))
            return null;

        var tipo = m.TryGetProperty("type", out var t) && t.TryGetInt32(out var n) ? n : 0;
        var texto = tipo is 0 or 19 && m.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String
            ? c.GetString() ?? "" : "";

        var autor = "";
        var bot = m.TryGetProperty("webhook_id", out var w) && w.ValueKind == JsonValueKind.String;
        if (m.TryGetProperty("author", out var a) && a.ValueKind == JsonValueKind.Object)
        {
            autor = (a.TryGetProperty("global_name", out var g) && g.ValueKind == JsonValueKind.String ? g.GetString() : null)
                ?? (a.TryGetProperty("username", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() : null)
                ?? "";
            bot |= a.TryGetProperty("bot", out var b) && b.ValueKind == JsonValueKind.True;
        }

        return new MensagemDoCanal(id, autor, texto, bot);
    }

    private static async Task<TimeSpan> RetryAfterAsync(HttpResponseMessage resp, CancellationToken ct)
    {
        var espera = Segundos(Cabecalho(resp, "Retry-After"));
        if (espera is null)
        {
            try
            {
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
                if (doc.RootElement.ValueKind == JsonValueKind.Object
                    && doc.RootElement.TryGetProperty("retry_after", out var r) && r.TryGetDouble(out var s))
                    espera = TimeSpan.FromSeconds(s);
            }
            catch (JsonException)
            {
                // Sem corpo legível: fica a espera padrão abaixo.
            }
        }

        espera ??= TimeSpan.FromSeconds(60);
        if (espera < TimeSpan.Zero) espera = TimeSpan.Zero;
        return espera > EsperaMaxima ? EsperaMaxima : espera.Value;
    }

    private static string? Cabecalho(HttpResponseMessage r, string nome) =>
        r.Headers.TryGetValues(nome, out var v) ? v.FirstOrDefault() : null;

    private static TimeSpan? Segundos(string? texto) =>
        double.TryParse(texto, NumberStyles.Float, CultureInfo.InvariantCulture, out var s) && s >= 0 && s < 86400
            ? TimeSpan.FromSeconds(s) : null;
}

/// <summary>Ids do Discord (snowflakes): números de 64 bits cuja parte alta é o instante de criação.</summary>
public static class Snowflake
{
    private const long EpocaDiscordMs = 1420070400000;

    public static bool Valido(string? id) => id is { Length: >= 1 and <= 20 } && id.All(char.IsAsciiDigit) && ulong.TryParse(id, out _);

    public static ulong Valor(string id) => ulong.TryParse(id, out var v) ? v : 0;

    /// <summary>Menor id possível criado no instante: usado como cursor inicial ("só o que chegar depois de configurar").</summary>
    public static string De(DateTimeOffset instante)
    {
        var ms = Math.Max(0, instante.ToUnixTimeMilliseconds() - EpocaDiscordMs);
        return ((ulong)ms << 22).ToString(CultureInfo.InvariantCulture);
    }

    public static string Maior(string a, string b) => Valor(a) >= Valor(b) ? a : b;
}
