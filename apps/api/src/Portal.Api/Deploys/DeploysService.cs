using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;

namespace Portal.Api.Deploys;

public record DeployPedido(Guid? RepositorioId, string? Titulo, string? Ambiente, DateTimeOffset? AgendadoPara);

public record DeployResposta(Guid Id, Guid RepositorioId, string Titulo, string Ambiente, string Status, DateTimeOffset AgendadoPara);

public enum ResultadoTipo { Ok, Invalido, NaoEncontrado, Conflito }

public record Resultado<T>(ResultadoTipo Tipo, T? Valor = default, string? Erro = null);

public partial class DeploysService
{
    public const int TituloMaximo = 200;
    public const int AmbienteMaximo = 50;
    public const string StatusAgendado = "agendado";
    public const string StatusCancelado = "cancelado";
    /// <summary>Deploy que aconteceu e deu certo (entra nas métricas, D-010).</summary>
    public const string StatusConcluido = "concluido";
    /// <summary>Deploy que aconteceu e falhou (entra nas métricas, D-010).</summary>
    public const string StatusFalhou = "falhou";

    private readonly PortalDbContext _db;

    public DeploysService(PortalDbContext db) => _db = db;

    [GeneratedRegex(@"^(\d{4})-W(\d{2})$")]
    private static partial Regex FormatoSemana();

    private static DeployResposta Mapear(Deploy d) =>
        new(d.Id, d.RepositorioId, d.Titulo, d.Ambiente, d.Status, d.AgendadoPara);

    public async Task<Resultado<List<DeployResposta>>> ListarPorSemanaAsync(string? semana, CancellationToken ct)
    {
        var m = FormatoSemana().Match(semana?.Trim() ?? "");
        if (!m.Success)
            return new(ResultadoTipo.Invalido, Erro: "Informe a semana no formato AAAA-Www, por exemplo 2026-W15.");

        var ano = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        var numero = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        if (ano < 1 || ano > 9998 || numero < 1 || numero > ISOWeek.GetWeeksInYear(ano))
            return new(ResultadoTipo.Invalido, Erro: "Semana inexistente. Use um número de semana válido, por exemplo 2026-W15.");

        var inicio = new DateTimeOffset(ISOWeek.ToDateTime(ano, numero, DayOfWeek.Monday), TimeSpan.Zero);
        var fim = inicio.AddDays(7);

        var itens = await _db.Deploys
            .Where(d => d.AgendadoPara >= inicio && d.AgendadoPara < fim)
            .OrderBy(d => d.AgendadoPara).ThenBy(d => d.CriadoEm)
            .ToListAsync(ct);
        return new(ResultadoTipo.Ok, itens.Select(Mapear).ToList());
    }

    public async Task<DeployResposta?> ObterAsync(Guid id, CancellationToken ct) =>
        await _db.Deploys.FirstOrDefaultAsync(d => d.Id == id, ct) is { } d ? Mapear(d) : null;

    public async Task<Resultado<DeployResposta>> CriarAsync(Guid workspaceId, DeployPedido pedido, CancellationToken ct)
    {
        var erro = await ValidarAsync(pedido, ct);
        if (erro is not null) return new(ResultadoTipo.Invalido, Erro: erro);

        var deploy = new Deploy
        {
            WorkspaceId = workspaceId,
            RepositorioId = pedido.RepositorioId!.Value,
            Titulo = pedido.Titulo!.Trim(),
            Ambiente = pedido.Ambiente!.Trim(),
            Status = StatusAgendado,
            AgendadoPara = pedido.AgendadoPara!.Value.ToUniversalTime(),
        };
        _db.Deploys.Add(deploy);
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(deploy));
    }

    public async Task<Resultado<DeployResposta>> EditarAsync(Guid id, DeployPedido pedido, CancellationToken ct)
    {
        var deploy = await _db.Deploys.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (deploy is null) return new(ResultadoTipo.NaoEncontrado);
        if (deploy.Status == StatusCancelado)
            return new(ResultadoTipo.Conflito, Erro: "Este deploy já foi cancelado e não pode ser editado.");

        var erro = await ValidarAsync(pedido, ct);
        if (erro is not null) return new(ResultadoTipo.Invalido, Erro: erro);

        deploy.RepositorioId = pedido.RepositorioId!.Value;
        deploy.Titulo = pedido.Titulo!.Trim();
        deploy.Ambiente = pedido.Ambiente!.Trim();
        deploy.AgendadoPara = pedido.AgendadoPara!.Value.ToUniversalTime();
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(deploy));
    }

    public async Task<Resultado<DeployResposta>> CancelarAsync(Guid id, CancellationToken ct)
    {
        var deploy = await _db.Deploys.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (deploy is null) return new(ResultadoTipo.NaoEncontrado);
        if (deploy.Status == StatusCancelado)
            return new(ResultadoTipo.Conflito, Erro: "Este deploy já foi cancelado.");

        deploy.Status = StatusCancelado;
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(deploy));
    }

    private async Task<string?> ValidarAsync(DeployPedido p, CancellationToken ct)
    {
        var titulo = p.Titulo?.Trim();
        if (string.IsNullOrEmpty(titulo)) return "Informe o título do deploy.";
        if (titulo.Length > TituloMaximo) return $"O título do deploy pode ter até {TituloMaximo} caracteres.";

        var ambiente = p.Ambiente?.Trim();
        if (string.IsNullOrEmpty(ambiente)) return "Informe o ambiente do deploy.";
        if (ambiente.Length > AmbienteMaximo) return $"O ambiente pode ter até {AmbienteMaximo} caracteres.";

        if (p.AgendadoPara is null) return "Informe a data do deploy.";
        if (p.RepositorioId is null || p.RepositorioId == Guid.Empty) return "Informe o repositório do deploy.";

        // O query filter do workspace atual garante que o repositório seja do mesmo workspace.
        if (!await _db.Repositorios.AnyAsync(r => r.Id == p.RepositorioId, ct))
            return "Repositório não encontrado neste workspace.";
        return null;
    }
}
