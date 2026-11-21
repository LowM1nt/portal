using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Metricas;

/// <summary>Valor do período, valor do período anterior (mesma duração) e variação percentual entre eles.</summary>
public record MetricaDto(double? Valor, double? Anterior, double? Variacao);

public record SemanaMetricasDto(
    DateTimeOffset Inicio, DateTimeOffset Fim, int Deploys, int Falhas,
    double? TaxaDeFalha, double? TempoAteDeployHoras, double? TempoParaRecuperarHoras);

public record MetricasDto(
    int Semanas, DateTimeOffset Inicio, DateTimeOffset Fim,
    MetricaDto DeploysPorDia, MetricaDto TempoAteDeployHoras, MetricaDto TaxaDeFalha, MetricaDto TempoParaRecuperarHoras,
    List<SemanaMetricasDto> Series);

/// <summary>
/// As quatro métricas de entrega (D-010), calculadas só com os deploys do workspace atual (query filter).
/// Um deploy conta como acontecido em <c>agendado_para</c>; só entram os com status concluido ou falhou.
/// Sem amostra, a métrica vem nula (nunca 0 inventado).
/// </summary>
public class MetricasService
{
    public static readonly int[] SemanasValidas = [4, 12];
    public const int SemanasPadrao = 12;

    private readonly PortalDbContext _db;
    private readonly TimeProvider _relogio;

    public MetricasService(PortalDbContext db, TimeProvider relogio)
    {
        _db = db;
        _relogio = relogio;
    }

    private sealed record Finalizado(Guid Id, Guid RepositorioId, bool Sucesso, DateTimeOffset Em, DateTimeOffset CriadoEm);

    private sealed record Amostra(DateTimeOffset Em, double Horas);

    public async Task<Resultado<MetricasDto>> CalcularAsync(string? semanasTexto, CancellationToken ct)
    {
        var semanas = SemanasPadrao;
        if (!string.IsNullOrWhiteSpace(semanasTexto) && (!int.TryParse(semanasTexto, out semanas) || !SemanasValidas.Contains(semanas)))
            return new(ResultadoTipo.Invalido, Erro: "Use semanas=4 ou semanas=12.");

        var fim = _relogio.GetUtcNow();
        var duracao = TimeSpan.FromDays(7 * semanas);
        var inicio = fim - duracao;
        var inicioAnterior = inicio - duracao;

        // Todo o histórico até agora: a recuperação precisa saber se a falha abriu ou continuou um incidente.
        var deploys = await _db.Deploys.AsNoTracking()
            .Where(d => d.AgendadoPara < fim &&
                        (d.Status == DeploysService.StatusConcluido || d.Status == DeploysService.StatusFalhou))
            .Select(d => new Finalizado(d.Id, d.RepositorioId, d.Status == DeploysService.StatusConcluido, d.AgendadoPara, d.CriadoEm))
            .ToListAsync(ct);

        var ligacoes = await (
                from i in _db.ItensRoadmap
                where i.DeployId != null && i.PullRequestId != null
                join p in _db.PullRequests on i.PullRequestId equals p.Id
                select new { DeployId = i.DeployId!.Value, p.CriadoEm })
            .ToListAsync(ct);
        var primeiraPr = ligacoes.GroupBy(l => l.DeployId).ToDictionary(g => g.Key, g => g.Min(l => l.CriadoEm));

        var tempos = deploys.Where(d => d.Sucesso)
            .Select(d => new Amostra(d.Em, (d.Em - (primeiraPr.TryGetValue(d.Id, out var pr) ? pr : d.CriadoEm)).TotalHours))
            .Where(a => a.Horas >= 0) // deploy registrado depois de acontecer: sem início confiável, fica de fora
            .ToList();
        var recuperacoes = Recuperacoes(deploys);

        MetricaDto Comparar(Func<DateTimeOffset, DateTimeOffset, double?> calculo)
        {
            var valor = calculo(inicio, fim);
            var anterior = calculo(inicioAnterior, inicio);
            double? variacao = valor is { } v && anterior is { } a && a != 0 ? Math.Round((v - a) / a * 100, 1) : null;
            return new MetricaDto(valor, anterior, variacao);
        }

        double PorDia(DateTimeOffset de, DateTimeOffset ate) =>
            Math.Round(deploys.Count(d => d.Sucesso && Dentro(d.Em, de, ate)) / (ate - de).TotalDays, 2);

        double? Taxa(DateTimeOffset de, DateTimeOffset ate)
        {
            var periodo = deploys.Where(d => Dentro(d.Em, de, ate)).ToList();
            return periodo.Count == 0 ? null : Math.Round(100.0 * periodo.Count(d => !d.Sucesso) / periodo.Count, 1);
        }

        double? MedianaEntre(List<Amostra> amostras, DateTimeOffset de, DateTimeOffset ate) =>
            Mediana(amostras.Where(a => Dentro(a.Em, de, ate)).Select(a => a.Horas).ToList());

        var series = Enumerable.Range(0, semanas).Select(n =>
        {
            var de = inicio + TimeSpan.FromDays(7 * n);
            var ate = de + TimeSpan.FromDays(7);
            return new SemanaMetricasDto(
                de, ate,
                deploys.Count(d => d.Sucesso && Dentro(d.Em, de, ate)),
                deploys.Count(d => !d.Sucesso && Dentro(d.Em, de, ate)),
                Taxa(de, ate),
                MedianaEntre(tempos, de, ate),
                MedianaEntre(recuperacoes, de, ate));
        }).ToList();

        return new(ResultadoTipo.Ok, new MetricasDto(
            semanas, inicio, fim,
            Comparar((de, ate) => PorDia(de, ate)),
            Comparar((de, ate) => MedianaEntre(tempos, de, ate)),
            Comparar(Taxa),
            Comparar((de, ate) => MedianaEntre(recuperacoes, de, ate)),
            series));
    }

    private static bool Dentro(DateTimeOffset em, DateTimeOffset de, DateTimeOffset ate) => em >= de && em < ate;

    /// <summary>
    /// Por repositório, em ordem de tempo: a primeira falha abre um incidente e o próximo deploy bem-sucedido o fecha.
    /// Falhas seguidas são o mesmo incidente. Incidente ainda aberto não vira amostra. A amostra conta na data da falha.
    /// </summary>
    private static List<Amostra> Recuperacoes(List<Finalizado> deploys)
    {
        var amostras = new List<Amostra>();
        foreach (var repo in deploys.GroupBy(d => d.RepositorioId))
        {
            DateTimeOffset? aberto = null;
            foreach (var d in repo.OrderBy(d => d.Em).ThenBy(d => d.CriadoEm))
            {
                if (!d.Sucesso) aberto ??= d.Em;
                else if (aberto is { } falha)
                {
                    amostras.Add(new Amostra(falha, (d.Em - falha).TotalHours));
                    aberto = null;
                }
            }
        }
        return amostras;
    }

    private static double? Mediana(List<double> valores)
    {
        if (valores.Count == 0) return null;
        valores.Sort();
        var meio = valores.Count / 2;
        var m = valores.Count % 2 == 1 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
        return Math.Round(m, 2);
    }
}
