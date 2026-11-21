using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Portal.Api.Bugs.Extracao;

/// <summary>
/// Pedido a um modelo: <see cref="Instrucoes"/> vão como instrução de sistema; <see cref="Conteudo"/> é o dado
/// (relato já delimitado); <see cref="Esquema"/> é o JSON schema da resposta (o provedor que suportar força o formato,
/// mas a resposta é sempre revalidada do nosso lado).
/// </summary>
public record PedidoIa(string Instrucoes, string Conteudo, JsonObject Esquema, int MaximoTokensSaida);

public enum TipoRespostaIa { Ok, ChaveInvalida, Transitoria, Recusada }

/// <summary>Resposta crua do modelo. <see cref="Texto"/> só em <see cref="TipoRespostaIa.Ok"/>.</summary>
public record RespostaIa(TipoRespostaIa Tipo, string? Texto = null);

/// <summary>Um provedor de IA (D-007). Hoje só o Gemini; outro provedor entra implementando esta interface.</summary>
public interface IProvedorDeIa
{
    /// <summary>Nome gravado na configuração do workspace (ex.: "gemini").</summary>
    string Nome { get; }

    Task<RespostaIa> GerarAsync(string chave, PedidoIa pedido, CancellationToken ct);
}

public static class ProvedoresDeIa
{
    public const string Padrao = ClienteGemini.NomeProvedor;
}

/// <summary>
/// Google Gemini (<c>generateContent</c>). A chave vai no cabeçalho <c>x-goog-api-key</c>, nunca na URL (a URL aparece
/// nos logs do HttpClient). Saída forçada em JSON com <c>responseSchema</c> e limitada por <c>maxOutputTokens</c>.
/// </summary>
public class ClienteGemini : IProvedorDeIa
{
    public const string NomeProvedor = "gemini";
    public const string Host = "generativelanguage.googleapis.com";
    public const string ModeloPadrao = "gemini-2.5-flash";

    /// <summary>Teto do corpo lido da resposta (a saída já é limitada em tokens; isto protege contra corpo anormal).</summary>
    public const int RespostaMaximaBytes = 256 * 1024;

    private readonly HttpClient _http;
    private readonly string _modelo;

    public ClienteGemini(HttpClient http, IConfiguration config)
    {
        _http = http;
        _http.BaseAddress ??= new Uri($"https://{Host}/v1beta/");
        var modelo = config["Ia:Gemini:Modelo"];
        _modelo = !string.IsNullOrWhiteSpace(modelo) && modelo.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.')
            ? modelo : ModeloPadrao;
    }

    public string Nome => NomeProvedor;

    public async Task<RespostaIa> GerarAsync(string chave, PedidoIa pedido, CancellationToken ct)
    {
        var corpo = new JsonObject
        {
            ["systemInstruction"] = new JsonObject { ["parts"] = new JsonArray(new JsonObject { ["text"] = pedido.Instrucoes }) },
            ["contents"] = new JsonArray(new JsonObject
            {
                ["role"] = "user",
                ["parts"] = new JsonArray(new JsonObject { ["text"] = pedido.Conteudo }),
            }),
            ["generationConfig"] = new JsonObject
            {
                ["responseMimeType"] = "application/json",
                ["responseSchema"] = pedido.Esquema.DeepClone(),
                ["maxOutputTokens"] = pedido.MaximoTokensSaida,
                ["temperature"] = 0.1,
            },
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, $"models/{_modelo}:generateContent")
        {
            Content = new StringContent(corpo.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        req.Headers.TryAddWithoutValidation("x-goog-api-key", chave);

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        if (resp.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.RequestTimeout || (int)resp.StatusCode >= 500)
            return new(TipoRespostaIa.Transitoria);
        if (resp.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            return new(TipoRespostaIa.ChaveInvalida);

        var texto = await LerLimitadoAsync(resp.Content, ct);
        if (texto is null) return new(TipoRespostaIa.Recusada);
        if (!resp.IsSuccessStatusCode)
            return new(texto.Contains("API_KEY_INVALID", StringComparison.Ordinal) ? TipoRespostaIa.ChaveInvalida : TipoRespostaIa.Recusada);

        try
        {
            using var doc = JsonDocument.Parse(texto);
            if (!doc.RootElement.TryGetProperty("candidates", out var candidatos) || candidatos.ValueKind != JsonValueKind.Array
                || candidatos.GetArrayLength() == 0)
                return new(TipoRespostaIa.Recusada);

            var c0 = candidatos[0];
            if (!c0.TryGetProperty("content", out var conteudo) || !conteudo.TryGetProperty("parts", out var partes)
                || partes.ValueKind != JsonValueKind.Array)
                return new(TipoRespostaIa.Recusada);

            var saida = new StringBuilder();
            foreach (var p in partes.EnumerateArray())
                if (p.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String)
                    saida.Append(t.GetString());
            return new(TipoRespostaIa.Ok, saida.ToString());
        }
        catch (JsonException)
        {
            return new(TipoRespostaIa.Recusada);
        }
    }

    private static async Task<string?> LerLimitadoAsync(HttpContent conteudo, CancellationToken ct)
    {
        await using var fluxo = await conteudo.ReadAsStreamAsync(ct);
        var buffer = new byte[RespostaMaximaBytes + 1];
        var lidos = 0;
        while (lidos < buffer.Length)
        {
            var n = await fluxo.ReadAsync(buffer.AsMemory(lidos), ct);
            if (n == 0) break;
            lidos += n;
        }

        return lidos > RespostaMaximaBytes ? null : Encoding.UTF8.GetString(buffer, 0, lidos);
    }
}
