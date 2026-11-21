using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Roadmap;

public record ItemRoadmapPedido(string? Titulo, string? Descricao, string? Status, DateOnly? Prazo, int? Progresso, Guid? DeployId, Guid? PullRequestId);

public record StatusPedido(string? Status);

public record ItemRoadmapResposta(
    Guid Id, string Titulo, string? Descricao, string Status, DateOnly? Prazo, int Progresso,
    Guid? DeployId, Guid? PullRequestId, DateTimeOffset CriadoEm, DateTimeOffset AtualizadoEm);

public class RoadmapService
{
    public const int TituloMaximo = 200;
    public static readonly string[] StatusValidos = ["ideia", "planejado", "em_andamento", "entregue"];

    private readonly PortalDbContext _db;

    public RoadmapService(PortalDbContext db) => _db = db;

    private static ItemRoadmapResposta Mapear(ItemRoadmap i) =>
        new(i.Id, i.Titulo, i.Descricao, i.Status, i.Prazo, i.Progresso, i.DeployId, i.PullRequestId, i.CriadoEm, i.AtualizadoEm);

    public async Task<Resultado<List<ItemRoadmapResposta>>> ListarAsync(string? status, CancellationToken ct)
    {
        var consulta = _db.ItensRoadmap.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (!StatusValidos.Contains(status))
                return new(ResultadoTipo.Invalido, Erro: StatusInvalido);
            consulta = consulta.Where(i => i.Status == status);
        }
        var itens = await consulta.OrderBy(i => i.CriadoEm).ToListAsync(ct);
        return new(ResultadoTipo.Ok, itens.Select(Mapear).ToList());
    }

    public async Task<ItemRoadmapResposta?> ObterAsync(Guid id, CancellationToken ct) =>
        await _db.ItensRoadmap.FirstOrDefaultAsync(i => i.Id == id, ct) is { } i ? Mapear(i) : null;

    public async Task<Resultado<ItemRoadmapResposta>> CriarAsync(Guid workspaceId, ItemRoadmapPedido p, CancellationToken ct)
    {
        var status = string.IsNullOrWhiteSpace(p.Status) ? "ideia" : p.Status;
        if (!StatusValidos.Contains(status)) return new(ResultadoTipo.Invalido, Erro: StatusInvalido);
        var erro = await ValidarAsync(p, ct);
        if (erro is not null) return new(ResultadoTipo.Invalido, Erro: erro);

        var item = new ItemRoadmap { WorkspaceId = workspaceId, Status = status };
        Aplicar(item, p);
        _db.ItensRoadmap.Add(item);
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(item));
    }

    public async Task<Resultado<ItemRoadmapResposta>> EditarAsync(Guid id, ItemRoadmapPedido p, CancellationToken ct)
    {
        var item = await _db.ItensRoadmap.FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null) return new(ResultadoTipo.NaoEncontrado);
        var erro = await ValidarAsync(p, ct);
        if (erro is not null) return new(ResultadoTipo.Invalido, Erro: erro);

        Aplicar(item, p);
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(item));
    }

    public async Task<Resultado<ItemRoadmapResposta>> MoverAsync(Guid id, StatusPedido p, CancellationToken ct)
    {
        var item = await _db.ItensRoadmap.FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null) return new(ResultadoTipo.NaoEncontrado);
        if (p.Status is null || !StatusValidos.Contains(p.Status))
            return new(ResultadoTipo.Invalido, Erro: StatusInvalido);

        item.Status = p.Status;
        item.AtualizadoEm = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
        return new(ResultadoTipo.Ok, Mapear(item));
    }

    public async Task<bool> ApagarAsync(Guid id, CancellationToken ct)
    {
        var item = await _db.ItensRoadmap.FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null) return false;
        _db.ItensRoadmap.Remove(item);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    private const string StatusInvalido = "Status inválido. Use ideia, planejado, em_andamento ou entregue.";

    private static void Aplicar(ItemRoadmap item, ItemRoadmapPedido p)
    {
        item.Titulo = p.Titulo!.Trim();
        item.Descricao = p.Descricao;
        item.Prazo = p.Prazo;
        item.Progresso = p.Progresso ?? 0;
        item.DeployId = p.DeployId;
        item.PullRequestId = p.PullRequestId;
        item.AtualizadoEm = DateTimeOffset.UtcNow;
    }

    private async Task<string?> ValidarAsync(ItemRoadmapPedido p, CancellationToken ct)
    {
        var titulo = p.Titulo?.Trim();
        if (string.IsNullOrEmpty(titulo)) return "Informe o título do item.";
        if (titulo.Length > TituloMaximo) return $"O título do item pode ter até {TituloMaximo} caracteres.";
        if (p.Progresso is < 0 or > 100) return "O progresso deve estar entre 0 e 100.";

        // O query filter do workspace atual garante que deploy e PR sejam do mesmo workspace.
        if (p.DeployId is { } d && !await _db.Deploys.AnyAsync(x => x.Id == d, ct))
            return "Deploy não encontrado neste workspace.";
        if (p.PullRequestId is { } pr && !await _db.PullRequests.AnyAsync(x => x.Id == pr, ct))
            return "Pull request não encontrada neste workspace.";
        return null;
    }
}
