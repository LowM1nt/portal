using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;

namespace Portal.Api.Bugs.Discord;

/// <summary>
/// A cada minuto lê o canal de bugs dos workspaces com bot configurado (P-025). Falha do Discord nunca derruba a API:
/// o erro fica gravado no workspace (como o GitHub, D-004).
/// </summary>
public class CaptacaoDoDiscord : BackgroundService
{
    public static readonly TimeSpan Intervalo = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _escopos;
    private readonly TimeProvider _relogio;
    private readonly ILogger<CaptacaoDoDiscord> _log;

    public CaptacaoDoDiscord(IServiceScopeFactory escopos, TimeProvider relogio, ILogger<CaptacaoDoDiscord> log)
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
                    _log.LogError("Falha inesperada no ciclo de captação do Discord: {Tipo}", e.GetType().Name);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Parada normal do host.
        }
    }

    /// <summary>Um ciclo: um escopo de DI; cada workspace tem o seu try/catch.</summary>
    public async Task ExecutarCicloAsync(CancellationToken ct)
    {
        using var escopo = _escopos.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var importador = escopo.ServiceProvider.GetRequiredService<ImportadorDoDiscord>();

        var workspaces = await db.Set<ConfiguracaoDiscord>().IgnoreQueryFilters().AsNoTracking()
            .Select(c => c.WorkspaceId).ToListAsync(ct);

        foreach (var workspaceId in workspaces)
        {
            ct.ThrowIfCancellationRequested();
            ResultadoCaptacao resultado;
            try
            {
                resultado = await importador.ImportarWorkspaceAsync(workspaceId, ct);
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                // Só o tipo da exceção vai para o log: a mensagem poderia conter o token.
                _log.LogWarning("Captação do Discord falhou no workspace {Workspace}: {Tipo}", workspaceId, e.GetType().Name);
                resultado = new(StatusCaptacao.Erro);
            }

            // Esperando o rate limit: não houve leitura, nada a registrar.
            if (resultado.Status == StatusCaptacao.Aguardando && resultado.BugsCriados == 0) continue;

            try
            {
                db.ChangeTracker.Clear();
                var agora = _relogio.GetUtcNow();
                var erro = ErroDe(resultado.Status);
                await db.Set<ConfiguracaoDiscord>().IgnoreQueryFilters()
                    .Where(c => c.WorkspaceId == workspaceId)
                    .ExecuteUpdateAsync(s => s
                        .SetProperty(c => c.UltimaLeitura, agora)
                        .SetProperty(c => c.UltimoErro, erro), ct);
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                _log.LogError("Não foi possível gravar o resultado da captação do workspace {Workspace}: {Tipo}", workspaceId, e.GetType().Name);
            }
        }
    }

    public static string? ErroDe(StatusCaptacao status) => status switch
    {
        StatusCaptacao.AcessoNegado => "Token do bot inválido ou sem acesso ao canal.",
        StatusCaptacao.CanalNaoEncontrado => "Canal do Discord não encontrado.",
        StatusCaptacao.Erro => "Não foi possível ler o canal do Discord.",
        _ => null,
    };
}
