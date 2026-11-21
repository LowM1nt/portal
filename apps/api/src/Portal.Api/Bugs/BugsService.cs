using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Bugs;

public record BugPedido(string? Titulo, string? Relato, string? Passos, string? Esperado, string? Obtido, string? Severidade, string? Origem);

public record BugStatusPedido(string? Status);

public record BugResposta(
    Guid Id, string Titulo, string Relato, string Passos, string Esperado, string Obtido,
    string Severidade, string Origem, string Status, DateTimeOffset CriadoEm, DateTimeOffset AtualizadoEm);

public class BugsService
{
    public const int TituloMaximo = 200;
    public const int RelatoMaximo = 10000;
    public const int CampoMaximo = 4000;

    private readonly PortalDbContext _db;
    private readonly TimeProvider _relogio;

    public BugsService(PortalDbContext db, TimeProvider relogio)
    {
        _db = db;
        _relogio = relogio;
    }

    private static BugResposta Mapear(Bug b) => new(
        b.Id, b.Titulo, b.Relato, b.Passos, b.Esperado, b.Obtido,
        TextoBug.Para(b.Severidade), TextoBug.Para(b.Origem), TextoBug.Para(b.Status), b.CriadoEm, b.AtualizadoEm);

    public async Task<Resultado<List<BugResposta>>> ListarAsync(string? status, CancellationToken ct)
    {
        var consulta = _db.Bugs.AsQueryable();
        if (status is not null)
        {
            if (TextoBug.Status(status) is not { } s)
                return new(ResultadoTipo.Invalido, Erro: "Status desconhecido. Use a_triar, aberto, em_andamento, resolvido ou descartado.");
            consulta = consulta.Where(b => b.Status == s);
        }

        var itens = await consulta.OrderByDescending(b => b.CriadoEm).ThenBy(b => b.Id).ToListAsync(ct);
        return new(ResultadoTipo.Ok, itens.Select(Mapear).ToList());
    }

    public async Task<BugResposta?> ObterAsync(Guid id, CancellationToken ct) =>
        await _db.Bugs.FirstOrDefaultAsync(b => b.Id == id, ct) is { } b ? Mapear(b) : null;

    public async Task<Resultado<BugResposta>> CriarAsync(Guid workspaceId, BugPedido p, CancellationToken ct)
    {
        var titulo = p.Titulo?.Trim();
        if (string.IsNullOrEmpty(titulo)) return Invalido("Informe o título do bug.");
        if (titulo.Length > TituloMaximo) return Invalido($"O título do bug pode ter até {TituloMaximo} caracteres.");
        if ((p.Relato?.Length ?? 0) > RelatoMaximo) return Invalido($"O relato pode ter até {RelatoMaximo} caracteres.");
        if ((p.Passos?.Length ?? 0) > CampoMaximo) return Invalido($"Os passos podem ter até {CampoMaximo} caracteres.");
        if ((p.Esperado?.Length ?? 0) > CampoMaximo) return Invalido($"O comportamento esperado pode ter até {CampoMaximo} caracteres.");
        if ((p.Obtido?.Length ?? 0) > CampoMaximo) return Invalido($"O comportamento obtido pode ter até {CampoMaximo} caracteres.");
        if (TextoBug.Severidade(p.Severidade) is not { } severidade)
            return Invalido("Severidade inválida. Use baixa, media, alta ou critica.");
        if (TextoBug.Origem(p.Origem) is not { } origem)
            return Invalido("Origem inválida. Use manual ou discord.");

        var agora = _relogio.GetUtcNow();
        var bug = new Bug
        {
            WorkspaceId = workspaceId,
            Titulo = titulo,
            Relato = p.Relato ?? "",
            Passos = p.Passos ?? "",
            Esperado = p.Esperado ?? "",
            Obtido = p.Obtido ?? "",
            Severidade = severidade,
            Origem = origem,
            Status = StatusBug.ATriar,
            CriadoEm = agora,
            AtualizadoEm = agora,
        };
        _db.Bugs.Add(bug);
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(bug));
    }

    public async Task<Resultado<BugResposta>> MudarStatusAsync(Guid id, BugStatusPedido p, CancellationToken ct)
    {
        var bug = await _db.Bugs.FirstOrDefaultAsync(b => b.Id == id, ct);
        if (bug is null) return new(ResultadoTipo.NaoEncontrado);
        if (TextoBug.Status(p.Status) is not { } status)
            return Invalido("Status inválido. Use a_triar, aberto, em_andamento, resolvido ou descartado.");

        bug.Status = status;
        bug.AtualizadoEm = _relogio.GetUtcNow();
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(bug));
    }

    private static Resultado<BugResposta> Invalido(string erro) => new(ResultadoTipo.Invalido, Erro: erro);
}
