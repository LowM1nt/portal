using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;

namespace Portal.Api.Revisoes;

public record RevisaoResposta(
    int Numero, string Titulo, string Autor, string Url, string Repositorio,
    IReadOnlyList<string> Revisores, string StatusCi, DateTimeOffset? AtualizadaEm);

public class RevisoesService
{
    private readonly PortalDbContext _db;

    public RevisoesService(PortalDbContext db) => _db = db;

    /// <summary>PRs abertas, não rascunho e com revisor (login ou equipe) pendente, das mais antigas às mais novas.</summary>
    public async Task<List<RevisaoResposta>> ListarAsync(string? repositorio, string? revisor, CancellationToken ct)
    {
        // Os query filters do workspace atual valem para PullRequests e Repositorios.
        var consulta = _db.PullRequests.Where(p => p.Estado == "open" && !p.Draft
            && (p.RevisoresSolicitados.Count > 0 || p.EquipesSolicitadas.Count > 0));

        if (!string.IsNullOrWhiteSpace(revisor))
        {
            var login = revisor.Trim();
            consulta = consulta.Where(p => p.RevisoresSolicitados.Contains(login));
        }

        var juncao = consulta.Join(_db.Repositorios, p => p.RepositorioId, r => r.Id, (p, r) => new { p, Repo = r.Nome });
        if (!string.IsNullOrWhiteSpace(repositorio))
        {
            var nome = repositorio.Trim();
            juncao = juncao.Where(x => x.Repo == nome);
        }

        var itens = await juncao
            .OrderBy(x => x.p.AtualizadaEm).ThenBy(x => x.p.Numero)
            .ToListAsync(ct);

        return itens.Select(x => new RevisaoResposta(
            x.p.Numero, x.p.Titulo, x.p.Autor, x.p.Url, x.Repo,
            [.. x.p.RevisoresSolicitados, .. x.p.EquipesSolicitadas], x.p.StatusCi, x.p.AtualizadaEm)).ToList();
    }
}
