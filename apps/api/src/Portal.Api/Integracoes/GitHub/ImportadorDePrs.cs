using System.Collections.Concurrent;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados;
using Portal.Api.Dados.Entidades;

namespace Portal.Api.Integracoes.GitHub;

public enum StatusImportacao { Importado, SemMudanca, LimiteAtingido, TokenInvalido, Erro }

public record ResultadoImportacao(string Repositorio, StatusImportacao Status, string? Erro = null);

/// <summary>ETag da primeira página por (workspace, repositório), só em memória.</summary>
public class EtagsGitHub
{
    public ConcurrentDictionary<(Guid Workspace, string Repo), string> Valores { get; } = new();
}

public class ImportadorDePrs
{
    private readonly PortalDbContext _db;
    private readonly ClienteGitHub _cliente;
    private readonly IDataProtector _protetor;
    private readonly EtagsGitHub _etags;

    public ImportadorDePrs(PortalDbContext db, ClienteGitHub cliente, IDataProtectionProvider protecao, EtagsGitHub etags)
    {
        _db = db;
        _cliente = cliente;
        _protetor = protecao.CreateProtector(GitHubConfigService.Proposito);
        _etags = etags;
    }

    public async Task<IReadOnlyList<ResultadoImportacao>> ImportarWorkspaceAsync(Guid workspaceId, CancellationToken ct)
    {
        var config = await _db.Set<ConfiguracaoGitHub>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.WorkspaceId == workspaceId, ct);
        if (config is null) return [];

        var token = _protetor.Unprotect(config.TokenCriptografado);
        var resultados = new List<ResultadoImportacao>();
        foreach (var repo in config.Repositorios)
        {
            var resultado = await ImportarRepositorioAsync(workspaceId, repo, token, ct);
            resultados.Add(resultado);
            if (resultado.Status is StatusImportacao.TokenInvalido or StatusImportacao.LimiteAtingido) break;
        }

        return resultados;
    }

    private async Task<ResultadoImportacao> ImportarRepositorioAsync(Guid workspaceId, string repo, string token, CancellationToken ct)
    {
        var chave = (workspaceId, repo);
        _etags.Valores.TryGetValue(chave, out var etag);

        ResultadoListagem lista;
        try
        {
            lista = await _cliente.ListarPrsAbertasAsync(repo, token, etag, ct);
        }
        catch (TokenInvalidoException e)
        {
            return new(repo, StatusImportacao.TokenInvalido, e.Message);
        }
        catch (Exception e) when (e is HttpRequestException or System.Text.Json.JsonException or InvalidOperationException)
        {
            return new(repo, StatusImportacao.Erro, e.Message);
        }

        var ci = new EstadoCi { LimiteAtingido = lista.LimiteRestante is { } cota && cota <= ClienteGitHub.LimiteMinimo };
        if (lista.Tipo == TipoListagem.SemMudanca) return await ReconsultarCiAsync(workspaceId, repo, token, ci, ct);
        if (lista.Tipo == TipoListagem.LimiteAtingido) return new(repo, StatusImportacao.LimiteAtingido);

        // ETag só vale para listagem de página única; com mais de uma página, descartar.
        if (lista.Paginas == 1 && lista.ETag is { } novo) _etags.Valores[chave] = novo;
        else _etags.Valores.TryRemove(chave, out _);

        var rep = await _db.Repositorios.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.WorkspaceId == workspaceId && r.Nome == repo, ct);
        if (rep is null)
        {
            rep = new Repositorio { WorkspaceId = workspaceId, Nome = repo };
            _db.Add(rep);
        }

        var existentes = await _db.PullRequests.IgnoreQueryFilters()
            .Where(p => p.WorkspaceId == workspaceId && p.RepositorioId == rep.Id)
            .ToDictionaryAsync(p => p.Numero, ct);

        // A paginação do GitHub é por página: uma PR aberta entre duas páginas pode vir duas vezes.
        var vistas = new HashSet<int>();
        foreach (var pr in lista.Prs)
        {
            if (!vistas.Add(pr.Numero)) continue;

            // Erro numa PR não interrompe as outras: ela mantém o status anterior.
            var statusCi = pr.Sha is { Length: > 0 } sha ? await ConsultarCiAsync(repo, sha, token, ci, ct) : null;

            if (existentes.Remove(pr.Numero, out var atual))
            {
                atual.Titulo = pr.Titulo;
                atual.Autor = pr.Autor;
                atual.Estado = "open";
                atual.Url = pr.Url;
                atual.AtualizadaEm = pr.AtualizadaEm;
                // O SHA vem sempre da listagem. Se o commit mudou e o CI dele não pôde ser lido agora,
                // o status do commit antigo não vale mais: fica "rodando" até a próxima consulta.
                if (statusCi is not null) atual.StatusCi = statusCi;
                else if (pr.Sha is { Length: > 0 } && pr.Sha != atual.ShaUltimoCommit) atual.StatusCi = StatusCi.Rodando;
                if (pr.Sha is { Length: > 0 }) atual.ShaUltimoCommit = pr.Sha;
            }
            else
            {
                _db.Add(new PullRequest
                {
                    WorkspaceId = workspaceId, RepositorioId = rep.Id, Numero = pr.Numero,
                    Titulo = pr.Titulo, Autor = pr.Autor, Estado = "open",
                    Url = pr.Url, AtualizadaEm = pr.AtualizadaEm,
                    StatusCi = statusCi ?? (pr.Sha is { Length: > 0 } ? StatusCi.Rodando : StatusCi.SemCi), ShaUltimoCommit = pr.Sha,
                });
            }
        }

        // O que sobrou não veio numa listagem completa: foi fechada.
        _db.PullRequests.RemoveRange(existentes.Values);
        await _db.SaveChangesAsync(ct);
        if (ci.TokenInvalido) return new(repo, StatusImportacao.TokenInvalido, new TokenInvalidoException().Message);
        return new(repo, ci.LimiteAtingido ? StatusImportacao.LimiteAtingido : StatusImportacao.Importado);
    }

    private sealed class EstadoCi
    {
        public bool TokenInvalido { get; set; }
        public bool LimiteAtingido { get; set; }
    }

    /// <summary>Status de CI do commit, ou null se não deu para consultar (erro, token inválido ou cota no fim).</summary>
    private async Task<string?> ConsultarCiAsync(string repo, string sha, string token, EstadoCi estado, CancellationToken ct)
    {
        if (estado.TokenInvalido || estado.LimiteAtingido) return null;
        try
        {
            var ci = await _cliente.ConsultarStatusCiAsync(repo, sha, token, ct);
            if (ci.LimiteRestante is { } r && r <= ClienteGitHub.LimiteMinimo) estado.LimiteAtingido = true;
            return ci.Status;
        }
        catch (TokenInvalidoException)
        {
            estado.TokenInvalido = true;
            return null;
        }
        catch (Exception e) when (e is HttpRequestException or System.Text.Json.JsonException
            or InvalidOperationException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            return null;
        }
    }

    /// <summary>A lista de PRs não mudou (304), mas o CI pode ter mudado: reconsulta pelo SHA gravado.</summary>
    private async Task<ResultadoImportacao> ReconsultarCiAsync(Guid workspaceId, string repo, string token, EstadoCi ci, CancellationToken ct)
    {
        var prs = await _db.PullRequests.IgnoreQueryFilters()
            .Where(p => p.WorkspaceId == workspaceId && p.ShaUltimoCommit != null
                && _db.Repositorios.IgnoreQueryFilters().Any(r => r.Id == p.RepositorioId && r.WorkspaceId == workspaceId && r.Nome == repo))
            .ToListAsync(ct);
        foreach (var pr in prs)
        {
            var status = await ConsultarCiAsync(repo, pr.ShaUltimoCommit!, token, ci, ct);
            if (status is not null) pr.StatusCi = status;
        }

        await _db.SaveChangesAsync(ct);
        if (ci.TokenInvalido) return new(repo, StatusImportacao.TokenInvalido, new TokenInvalidoException().Message);
        return new(repo, ci.LimiteAtingido ? StatusImportacao.LimiteAtingido : StatusImportacao.SemMudanca);
    }
}
