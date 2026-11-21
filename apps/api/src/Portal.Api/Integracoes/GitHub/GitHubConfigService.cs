using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;
using Portal.Api.Deploys;

namespace Portal.Api.Integracoes.GitHub;

public record GitHubConfigPedido(string? Token, string[]? Repositorios);

public record GitHubConfigResposta(
    bool Configurado,
    string? FinalToken,
    string[] Repositorios,
    DateTimeOffset? UltimaSincronizacao,
    string? UltimoErro,
    DateTimeOffset? ConfiguradoEm = null);

public partial class GitHubConfigService
{
    public const string Proposito = "Portal.Integracoes.GitHub.Token";
    private const int TokenMaximo = 500;
    public const int RepositoriosMaximos = 50;

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
        new(true, c.FinalToken, c.Repositorios, c.UltimaSincronizacao, c.UltimoErro, c.ConfiguradoEm);

    public async Task<GitHubConfigResposta> ObterAsync(CancellationToken ct) =>
        await _db.Set<ConfiguracaoGitHub>().FirstOrDefaultAsync(ct) is { } c
            ? Mapear(c)
            : new(false, null, [], null, null);

    public async Task<Resultado<GitHubConfigResposta>> SalvarAsync(Guid workspaceId, GitHubConfigPedido pedido, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoGitHub>().FirstOrDefaultAsync(ct);
        var token = pedido.Token?.Trim();
        // Já configurado e sem token novo: só troca a lista de repositórios (o token guardado continua).
        var trocarToken = !string.IsNullOrEmpty(token) || config is null;
        if (trocarToken && string.IsNullOrEmpty(token))
            return new(ResultadoTipo.Invalido, Erro: "Informe o token do GitHub.");
        if (token is not null && token.Length > TokenMaximo)
            return new(ResultadoTipo.Invalido, Erro: "O token do GitHub é longo demais.");

        var repos = (pedido.Repositorios ?? []).Select(r => r?.Trim() ?? "").ToArray();
        if (repos.Any(r => !FormatoRepositorio().IsMatch(r) || r.Split('/').Any(parte => parte is "." or "..")))
            return new(ResultadoTipo.Invalido, Erro: "Cada repositório deve estar no formato dono/repo.");
        repos = repos.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (repos.Length > RepositoriosMaximos)
            return new(ResultadoTipo.Invalido, Erro: $"Dá pra acompanhar até {RepositoriosMaximos} repositórios por workspace.");

        if (config is null)
        {
            config = new ConfiguracaoGitHub { WorkspaceId = workspaceId };
            _db.Add(config);
        }

        if (trocarToken)
        {
            config.TokenCriptografado = _protetor.Protect(token!);
            config.FinalToken = token!.Length <= 4 ? token : token[^4..];
            config.ConfiguradoEm = DateTimeOffset.UtcNow;
            config.UltimaSincronizacao = null;
            config.UltimoErro = null;
        }
        config.Repositorios = repos;

        // Os repositórios já existem para o formulário de deploy antes da 1ª sincronização (mesmo nome que o importador usa).
        // Tirar um repositório da lista não apaga o registro: os deploys dele continuam.
        var existentes = await _db.Repositorios.Select(r => r.Nome).ToListAsync(ct);
        foreach (var nome in repos.Where(n => !existentes.Contains(n)))
            _db.Repositorios.Add(new Repositorio { WorkspaceId = workspaceId, Nome = nome });
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
