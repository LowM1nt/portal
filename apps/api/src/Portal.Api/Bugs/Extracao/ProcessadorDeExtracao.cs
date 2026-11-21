using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;

namespace Portal.Api.Bugs.Extracao;

/// <summary>
/// Processa a fila de extração (P-026): para cada sugestão pendente, chama a IA do workspace com a chave dele e grava
/// o resultado validado. Nada aqui altera os campos do bug; erro da IA nunca quebra nada (vira status "falhou").
/// </summary>
public class ProcessadorDeExtracao
{
    public const int PorCiclo = 10;
    public const int TentativasMaximas = 3;
    public static readonly TimeSpan TempoMaximoPorChamada = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan EsperaEntreTentativas = TimeSpan.FromMinutes(1);

    private readonly PortalDbContext _db;
    private readonly IEnumerable<IProvedorDeIa> _provedores;
    private readonly IDataProtector _protetor;
    private readonly TimeProvider _relogio;
    private readonly ILogger<ProcessadorDeExtracao> _log;

    public ProcessadorDeExtracao(PortalDbContext db, IEnumerable<IProvedorDeIa> provedores, IDataProtectionProvider protecao,
        TimeProvider relogio, ILogger<ProcessadorDeExtracao> log)
    {
        _db = db;
        _provedores = provedores;
        _protetor = protecao.CreateProtector(IaConfigService.Proposito);
        _relogio = relogio;
        _log = log;
    }

    /// <summary>Processa até <see cref="PorCiclo"/> pendentes vencidas. Devolve quantas foram tratadas.</summary>
    public async Task<int> ProcessarPendentesAsync(CancellationToken ct)
    {
        var agora = _relogio.GetUtcNow();
        var pendentes = await _db.Set<SugestaoIa>().IgnoreQueryFilters()
            .Where(s => s.Status == StatusSugestao.Pendente && s.ProximaTentativaEm <= agora)
            .OrderBy(s => s.ProximaTentativaEm).ThenBy(s => s.CriadoEm)
            .Take(PorCiclo)
            .ToListAsync(ct);

        foreach (var sugestao in pendentes)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                await ProcessarAsync(sugestao, ct);
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                // Só o tipo: a mensagem de uma exceção do HttpClient nunca deve levar a chave, mas não arriscamos.
                _log.LogWarning("Extração por IA falhou no bug {Bug}: {Tipo}", sugestao.BugId, e.GetType().Name);
                Falhar(sugestao, "Não foi possível processar o relato.");
            }

            sugestao.AtualizadoEm = _relogio.GetUtcNow();
            await _db.SaveChangesAsync(ct);
        }

        return pendentes.Count;
    }

    private async Task ProcessarAsync(SugestaoIa sugestao, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoIa>().IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.WorkspaceId == sugestao.WorkspaceId, ct);
        if (config is null)
        {
            // Chave removida depois de o bug entrar na fila: nada é enviado.
            sugestao.Status = StatusSugestao.Cancelada;
            return;
        }

        var provedor = _provedores.FirstOrDefault(p => p.Nome == config.Provedor);
        var bug = await _db.Bugs.IgnoreQueryFilters().AsNoTracking()
            .Where(b => b.Id == sugestao.BugId && b.WorkspaceId == sugestao.WorkspaceId)
            .Select(b => new { b.Titulo, b.Relato })
            .FirstOrDefaultAsync(ct);
        if (provedor is null || bug is null)
        {
            Falhar(sugestao, "Provedor de IA indisponível.");
            return;
        }

        var pedido = ExtratorDeRelato.Montar(bug.Titulo, bug.Relato);
        var chave = _protetor.Unprotect(config.ChaveCriptografada);
        sugestao.Tentativas++;

        RespostaIa resposta;
        using (var limite = CancellationTokenSource.CreateLinkedTokenSource(ct))
        {
            limite.CancelAfter(TempoMaximoPorChamada);
            try
            {
                resposta = await provedor.GerarAsync(chave, pedido, limite.Token);
            }
            catch (Exception e) when (!ct.IsCancellationRequested && e is HttpRequestException or OperationCanceledException)
            {
                resposta = new(TipoRespostaIa.Transitoria);
            }
        }

        switch (resposta.Tipo)
        {
            case TipoRespostaIa.Ok when ExtratorDeRelato.Validar(resposta.Texto) is { } x:
                sugestao.Status = StatusSugestao.Pronta;
                sugestao.Passos = x.Passos;
                sugestao.Esperado = x.Esperado;
                sugestao.Obtido = x.Obtido;
                sugestao.Ambiente = x.Ambiente;
                sugestao.Severidade = x.Severidade;
                sugestao.Area = x.Area;
                sugestao.Confianca = x.Confianca;
                sugestao.Evidencias = [.. x.Evidencias];
                sugestao.Erro = null;
                return;
            case TipoRespostaIa.Ok:
                Falhar(sugestao, "Resposta da IA fora do formato esperado.");
                return;
            case TipoRespostaIa.ChaveInvalida:
                Falhar(sugestao, "A chave da IA foi recusada pelo provedor.");
                return;
            case TipoRespostaIa.Transitoria when sugestao.Tentativas < TentativasMaximas:
                sugestao.ProximaTentativaEm = _relogio.GetUtcNow() + EsperaEntreTentativas * Math.Pow(2, sugestao.Tentativas - 1);
                return;
            case TipoRespostaIa.Transitoria:
                Falhar(sugestao, "A IA não respondeu depois de várias tentativas.");
                return;
            default:
                Falhar(sugestao, "A IA recusou o pedido.");
                return;
        }
    }

    private static void Falhar(SugestaoIa s, string erro)
    {
        s.Status = StatusSugestao.Falhou;
        s.Erro = erro;
    }
}

/// <summary>A cada 15 s processa a fila de extração. Fora do ambiente Testing (os testes chamam o processador direto).</summary>
public class ExtracaoEmSegundoPlano : BackgroundService
{
    public static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(15);

    private readonly IServiceScopeFactory _escopos;
    private readonly TimeProvider _relogio;
    private readonly ILogger<ExtracaoEmSegundoPlano> _log;

    public ExtracaoEmSegundoPlano(IServiceScopeFactory escopos, TimeProvider relogio, ILogger<ExtracaoEmSegundoPlano> log)
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
                    using var escopo = _escopos.CreateScope();
                    await escopo.ServiceProvider.GetRequiredService<ProcessadorDeExtracao>().ProcessarPendentesAsync(stoppingToken);
                }
                catch (Exception e) when (!stoppingToken.IsCancellationRequested)
                {
                    _log.LogError("Falha inesperada no ciclo de extração por IA: {Tipo}", e.GetType().Name);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Parada normal do host.
        }
    }
}
