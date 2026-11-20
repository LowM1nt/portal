using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;

namespace Portal.Api.Integracoes.GitHub;

/// <summary>A cada 10 minutos importa as PRs dos workspaces com token (D-004). Falha do GitHub nunca derruba o portal.</summary>
public class SincronizacaoGitHub : BackgroundService
{
    public static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(10);

    private readonly IServiceScopeFactory _escopos;
    private readonly TimeProvider _relogio;
    private readonly ILogger<SincronizacaoGitHub> _log;

    public SincronizacaoGitHub(IServiceScopeFactory escopos, TimeProvider relogio, ILogger<SincronizacaoGitHub> log)
    {
        _escopos = escopos;
        _relogio = relogio;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Intervalo, _relogio);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await ExecutarCicloAsync(stoppingToken);
                }
                catch (Exception e) when (!stoppingToken.IsCancellationRequested)
                {
                    _log.LogError(e, "Falha inesperada no ciclo de sincronização com o GitHub.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Parada normal do host.
        }
    }

    /// <summary>Um ciclo: um escopo de DI; cada workspace com token tem o seu try/catch.</summary>
    public async Task ExecutarCicloAsync(CancellationToken ct)
    {
        using var escopo = _escopos.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var importador = escopo.ServiceProvider.GetRequiredService<ImportadorDePrs>();

        var workspaces = await db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters().AsNoTracking()
            .Select(c => c.WorkspaceId).ToListAsync(ct);

        foreach (var workspaceId in workspaces)
        {
            ct.ThrowIfCancellationRequested();
            string? erro;
            try
            {
                erro = ErroDe(await importador.ImportarWorkspaceAsync(workspaceId, ct));
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                // Só o tipo da exceção vai para o log: a mensagem poderia conter o token.
                _log.LogWarning("Sincronização com o GitHub falhou no workspace {Workspace}: {Tipo}", workspaceId, e.GetType().Name);
                erro = "Não foi possível sincronizar com o GitHub.";
            }

            try
            {
                db.ChangeTracker.Clear();
                var agora = _relogio.GetUtcNow();
                await db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters()
                    .Where(c => c.WorkspaceId == workspaceId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(c => c.UltimaSincronizacao, agora)
                        .SetProperty(c => c.UltimoErro, erro), ct);
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                _log.LogError(e, "Não foi possível gravar o resultado da sincronização do workspace {Workspace}.", workspaceId);
            }
        }
    }

    private static string? ErroDe(IReadOnlyList<ResultadoImportacao> resultados)
    {
        if (resultados.Any(r => r.Status == StatusImportacao.TokenInvalido)) return "Token expirado ou inválido.";
        if (resultados.Any(r => r.Status == StatusImportacao.Erro)) return "Falha ao consultar o GitHub.";
        return null;
    }
}
