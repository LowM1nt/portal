namespace Portal.Api.Bugs.Discord;

/// <summary>Uma mensagem lida do canal de bugs. <see cref="Texto"/> vazio = sem relato (só anexo, mensagem de sistema...).</summary>
public record MensagemDoCanal(string Id, string Autor, string Texto, bool DeBot);

public enum TipoLeitura { Ok, LimiteAtingido, AcessoNegado, CanalNaoEncontrado, Erro }

/// <summary>
/// Resultado de uma leitura. <see cref="Mensagens"/> vem da mais antiga para a mais nova.
/// <see cref="EsperarPor"/>: o serviço pediu para não chamar de novo antes desse tempo (429 ou cota do balde no fim).
/// </summary>
public record LeituraDoCanal(TipoLeitura Tipo, IReadOnlyList<MensagemDoCanal> Mensagens, TimeSpan? EsperarPor = null);

/// <summary>
/// Canal de chat de onde chegam relatos de bug (D-006). Hoje só o Discord; o Slack entra implementando esta interface.
/// </summary>
public interface ICanalDeBugs
{
    /// <summary>Origem gravada no bug (ex.: "discord").</summary>
    OrigemBug Origem { get; }

    /// <summary>Quantas mensagens cabem numa leitura; menos que isso = não há mais nada novo agora.</summary>
    int PorLeitura { get; }

    /// <summary>Lê as mensagens do canal posteriores a <paramref name="depoisDe"/> (id exclusivo).</summary>
    Task<LeituraDoCanal> LerDepoisDeAsync(string token, string canalId, string depoisDe, CancellationToken ct);
}
