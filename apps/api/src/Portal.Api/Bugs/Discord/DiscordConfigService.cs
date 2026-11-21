using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Bugs.Discord;

/// <summary>Bot de bugs do Discord de um workspace (D-006, D-014). Um registro por workspace.</summary>
public class ConfiguracaoDiscord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string TokenCriptografado { get; set; } = "";
    public string FinalToken { get; set; } = "";
    public string CanalId { get; set; } = "";

    /// <summary>Id da última mensagem já lida (cursor do <c>after=</c>). Nulo = começa do instante da configuração.</summary>
    public string? UltimaMensagemId { get; set; }

    public DateTimeOffset ConfiguradoEm { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UltimaLeitura { get; set; }
    public string? UltimoErro { get; set; }
}

public record DiscordConfigPedido(string? Token, string? CanalId);

public record DiscordConfigResposta(
    bool Configurado,
    string? FinalToken,
    string? CanalId,
    DateTimeOffset? UltimaLeitura,
    string? UltimoErro,
    DateTimeOffset? ConfiguradoEm = null);

public partial class DiscordConfigService
{
    public const string Proposito = "Portal.Integracoes.Discord.Token";
    private const int TokenMaximo = 200;

    private readonly PortalDbContext _db;
    private readonly IDataProtector _protetor;
    private readonly EsperasDoDiscord _esperas;
    private readonly TimeProvider _relogio;

    public DiscordConfigService(PortalDbContext db, IDataProtectionProvider protecao, EsperasDoDiscord esperas, TimeProvider relogio)
    {
        _db = db;
        _protetor = protecao.CreateProtector(Proposito);
        _esperas = esperas;
        _relogio = relogio;
    }

    // Snowflake do canal: só dígitos (também impede qualquer coisa estranha no caminho da URL).
    [GeneratedRegex(@"^[0-9]{17,20}$")]
    private static partial Regex FormatoCanal();

    private static DiscordConfigResposta Mapear(ConfiguracaoDiscord c) =>
        new(true, c.FinalToken, c.CanalId, c.UltimaLeitura, c.UltimoErro, c.ConfiguradoEm);

    public async Task<DiscordConfigResposta> ObterAsync(CancellationToken ct) =>
        await _db.Set<ConfiguracaoDiscord>().FirstOrDefaultAsync(ct) is { } c
            ? Mapear(c)
            : new(false, null, null, null, null);

    public async Task<Resultado<DiscordConfigResposta>> SalvarAsync(Guid workspaceId, DiscordConfigPedido pedido, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoDiscord>().FirstOrDefaultAsync(ct);
        var token = pedido.Token?.Trim();
        var canal = pedido.CanalId?.Trim() ?? "";
        // Já configurado e sem token novo: só troca o canal (o token guardado continua).
        var trocarToken = !string.IsNullOrEmpty(token) || config is null;
        if (trocarToken && string.IsNullOrEmpty(token))
            return new(ResultadoTipo.Invalido, Erro: "Informe o token do bot do Discord.");
        if (token is not null && token.Length > TokenMaximo)
            return new(ResultadoTipo.Invalido, Erro: "O token do bot é longo demais.");
        if (!FormatoCanal().IsMatch(canal))
            return new(ResultadoTipo.Invalido, Erro: "Informe o ID do canal do Discord (só números).");

        var agora = _relogio.GetUtcNow();
        if (config is null)
        {
            config = new ConfiguracaoDiscord { WorkspaceId = workspaceId, ConfiguradoEm = agora };
            _db.Add(config);
        }

        if (trocarToken)
        {
            config.TokenCriptografado = _protetor.Protect(token!);
            config.FinalToken = token!.Length <= 4 ? token : token[^4..];
            config.UltimoErro = null;
        }

        if (config.CanalId != canal)
        {
            // Canal novo: começa do instante de agora (não importa o histórico do canal).
            config.CanalId = canal;
            config.UltimaMensagemId = null;
            config.ConfiguradoEm = agora;
            config.UltimaLeitura = null;
            config.UltimoErro = null;
        }

        await _db.SaveChangesAsync(ct);
        _esperas.Limpar(workspaceId);
        return new(ResultadoTipo.Ok, Mapear(config));
    }

    public async Task ApagarAsync(Guid workspaceId, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoDiscord>().FirstOrDefaultAsync(ct);
        if (config is null) return;
        _db.Remove(config);
        await _db.SaveChangesAsync(ct);
        _esperas.Limpar(workspaceId);
    }
}
