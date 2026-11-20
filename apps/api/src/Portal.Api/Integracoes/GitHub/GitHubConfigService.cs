using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Integracoes.GitHub;

public record GitHubConfigPedido(string? Token, string[]? Repositorios);

public record GitHubConfigResposta(
    bool Configurado,
    string? FinalToken,
    string[] Repositorios,
    DateTimeOffset? UltimaSincronizacao,
    string? UltimoErro);

public partial class GitHubConfigService
{
    public const string Proposito = "Portal.Integracoes.GitHub.Token";
    private const int TokenMaximo = 500;

    private readonly PortalDbContext _db;
    private readonly IDataProtector _protetor;

    public GitHubConfigService(PortalDbContext db, IDataProtectionProvider protecao)
    {
        _db = db;
        _protetor = protecao.CreateProtector(Proposito);
    }

    [GeneratedRegex(@"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")]
    private static partial Regex FormatoRepositorio();

    private static GitHubConfigResposta Mapear(ConfiguracaoGitHub c) =>
        new(true, c.FinalToken, c.Repositorios, c.UltimaSincronizacao, c.UltimoErro);

    public async Task<GitHubConfigResposta> ObterAsync(CancellationToken ct) =>
        await _db.Set<ConfiguracaoGitHub>().FirstOrDefaultAsync(ct) is { } c
            ? Mapear(c)
            : new(false, null, [], null, null);

    public async Task<Resultado<GitHubConfigResposta>> SalvarAsync(Guid workspaceId, GitHubConfigPedido pedido, CancellationToken ct)
    {
        var token = pedido.Token?.Trim();
        if (string.IsNullOrEmpty(token))
            return new(ResultadoTipo.Invalido, Erro: "Informe o token do GitHub.");
        if (token.Length > TokenMaximo)
            return new(ResultadoTipo.Invalido, Erro: "O token do GitHub é longo demais.");

        var repos = (pedido.Repositorios ?? []).Select(r => r?.Trim() ?? "").ToArray();
        if (repos.Any(r => !FormatoRepositorio().IsMatch(r)))
            return new(ResultadoTipo.Invalido, Erro: "Cada repositório deve estar no formato dono/repo.");
        repos = repos.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

        var config = await _db.Set<ConfiguracaoGitHub>().FirstOrDefaultAsync(ct);
        if (config is null)
        {
            config = new ConfiguracaoGitHub { WorkspaceId = workspaceId };
            _db.Add(config);
        }

        config.TokenCriptografado = _protetor.Protect(token);
        config.FinalToken = token.Length <= 4 ? token : token[^4..];
        config.Repositorios = repos;
        config.ConfiguradoEm = DateTimeOffset.UtcNow;
        config.UltimaSincronizacao = null;
        config.UltimoErro = null;
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(config));
    }

    public async Task ApagarAsync(CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoGitHub>().FirstOrDefaultAsync(ct);
        if (config is null) return;
        _db.Remove(config);
        await _db.SaveChangesAsync(ct);
    }
}
