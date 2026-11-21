using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;
using Portal.Api.Workspaces;

namespace Portal.Api.Bugs.Extracao;

/// <summary>Chave de IA do próprio workspace (D-007). Um registro por workspace.</summary>
public class ConfiguracaoIa
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkspaceId { get; set; }
    public string Provedor { get; set; } = "";
    public string ChaveCriptografada { get; set; } = "";
    public DateTimeOffset ConfiguradoEm { get; set; } = DateTimeOffset.UtcNow;
}

public record IaConfigPedido(string? Provedor, string? Chave);

/// <summary>Só diz se há chave e de qual provedor: nem a chave nem o final dela voltam.</summary>
public record IaConfigResposta(bool Configurado, string? Provedor);

public class IaConfigService
{
    public const string Proposito = "Portal.Integracoes.IA.Chave";
    private const int ChaveMaxima = 500;

    private readonly PortalDbContext _db;
    private readonly IDataProtector _protetor;
    private readonly HashSet<string> _provedores;
    private readonly TimeProvider _relogio;

    public IaConfigService(PortalDbContext db, IDataProtectionProvider protecao, IEnumerable<IProvedorDeIa> provedores, TimeProvider relogio)
    {
        _db = db;
        _protetor = protecao.CreateProtector(Proposito);
        _provedores = provedores.Select(p => p.Nome).ToHashSet(StringComparer.Ordinal);
        _relogio = relogio;
    }

    public async Task<IaConfigResposta> ObterAsync(CancellationToken ct) =>
        await _db.Set<ConfiguracaoIa>().FirstOrDefaultAsync(ct) is { } c ? new(true, c.Provedor) : new(false, null);

    public async Task<Resultado<IaConfigResposta>> SalvarAsync(Guid workspaceId, IaConfigPedido pedido, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoIa>().FirstOrDefaultAsync(ct);
        var provedor = pedido.Provedor?.Trim().ToLowerInvariant() is { Length: > 0 } p ? p : config?.Provedor ?? ProvedoresDeIa.Padrao;
        if (!_provedores.Contains(provedor))
            return new(ResultadoTipo.Invalido, Erro: $"Provedor de IA não suportado. Use: {string.Join(", ", _provedores.Order())}.");

        var chave = pedido.Chave?.Trim();
        // Já configurado e sem chave nova: só troca o provedor (a chave guardada continua).
        var trocarChave = !string.IsNullOrEmpty(chave) || config is null;
        if (trocarChave && string.IsNullOrEmpty(chave))
            return new(ResultadoTipo.Invalido, Erro: "Informe a chave da IA.");
        if (chave is not null && chave.Length > ChaveMaxima)
            return new(ResultadoTipo.Invalido, Erro: "A chave da IA é longa demais.");

        if (config is null)
        {
            config = new ConfiguracaoIa { WorkspaceId = workspaceId };
            _db.Add(config);
        }

        config.Provedor = provedor;
        if (trocarChave)
        {
            config.ChaveCriptografada = _protetor.Protect(chave!);
            config.ConfiguradoEm = _relogio.GetUtcNow();
        }

        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, new(true, config.Provedor));
    }

    public async Task ApagarAsync(CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoIa>().FirstOrDefaultAsync(ct);
        if (config is null) return;
        _db.Remove(config);
        await _db.SaveChangesAsync(ct);
    }
}

public static class IaEndpoints
{
    public static void MapIa(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api/integracoes/ia").RequerWorkspace();

        api.MapGet("", async (IaConfigService servico, CancellationToken ct) =>
            Results.Ok(await servico.ObterAsync(ct)));

        api.MapPut("", async (IaConfigPedido pedido, WorkspaceAtual ws, IaConfigService servico, CancellationToken ct) =>
        {
            var r = await servico.SalvarAsync(ws.Id, pedido, ct);
            return r.Tipo == ResultadoTipo.Ok ? Results.Ok(r.Valor) : Results.BadRequest(new { erro = r.Erro });
        }).RequerPapel(Papeis.Dono);

        api.MapDelete("", async (IaConfigService servico, CancellationToken ct) =>
        {
            await servico.ApagarAsync(ct);
            return Results.NoContent();
        }).RequerPapel(Papeis.Dono);
    }
}
