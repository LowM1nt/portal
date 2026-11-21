using System.Collections.Concurrent;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Bugs.Extracao;
using Portal.Api.Dados;

namespace Portal.Api.Bugs.Discord;

/// <summary>Até quando cada workspace deve esperar antes de chamar o Discord de novo (rate limit). Só em memória.</summary>
public class EsperasDoDiscord
{
    private readonly ConcurrentDictionary<Guid, DateTimeOffset> _ate = new();

    public bool Aguardando(Guid workspace, DateTimeOffset agora) => _ate.TryGetValue(workspace, out var ate) && agora < ate;

    public void Definir(Guid workspace, DateTimeOffset ate) => _ate[workspace] = ate;

    public void Limpar(Guid workspace) => _ate.TryRemove(workspace, out _);
}

public enum StatusCaptacao { Lido, Aguardando, AcessoNegado, CanalNaoEncontrado, Erro }

public record ResultadoCaptacao(StatusCaptacao Status, int BugsCriados = 0);

/// <summary>
/// Lê as mensagens novas do canal de um workspace (P-025) e cria um bug "a triar" para cada relato.
/// Ignora bots e mensagens sem texto; a mesma mensagem nunca vira dois bugs (índice único + checagem antes).
/// </summary>
public class ImportadorDoDiscord
{
    /// <summary>Páginas de <see cref="ICanalDeBugs.PorLeitura"/> por workspace a cada ciclo (o resto fica para o próximo).</summary>
    public const int PaginasPorCiclo = 5;

    public const int TituloMaximo = 120;
    public const int AutorMaximo = 100;

    private readonly PortalDbContext _db;
    private readonly ICanalDeBugs _canal;
    private readonly IDataProtector _protetor;
    private readonly EsperasDoDiscord _esperas;
    private readonly TimeProvider _relogio;

    public ImportadorDoDiscord(PortalDbContext db, ICanalDeBugs canal, IDataProtectionProvider protecao,
        EsperasDoDiscord esperas, TimeProvider relogio)
    {
        _db = db;
        _canal = canal;
        _protetor = protecao.CreateProtector(DiscordConfigService.Proposito);
        _esperas = esperas;
        _relogio = relogio;
    }

    public async Task<ResultadoCaptacao> ImportarWorkspaceAsync(Guid workspaceId, CancellationToken ct)
    {
        if (_esperas.Aguardando(workspaceId, _relogio.GetUtcNow())) return new(StatusCaptacao.Aguardando);

        var config = await _db.Set<ConfiguracaoDiscord>().IgnoreQueryFilters()
            .FirstOrDefaultAsync(c => c.WorkspaceId == workspaceId, ct);
        if (config is null) return new(StatusCaptacao.Lido);

        var token = _protetor.Unprotect(config.TokenCriptografado);
        var temChaveDeIa = await FilaDeExtracao.TemChaveAsync(_db, workspaceId, ct);
        var criados = 0;

        for (var pagina = 0; pagina < PaginasPorCiclo; pagina++)
        {
            var cursor = config.UltimaMensagemId ?? Snowflake.De(config.ConfiguradoEm);
            var leitura = await _canal.LerDepoisDeAsync(token, config.CanalId, cursor, ct);
            switch (leitura.Tipo)
            {
                case TipoLeitura.LimiteAtingido:
                    _esperas.Definir(workspaceId, _relogio.GetUtcNow() + (leitura.EsperarPor ?? TimeSpan.Zero));
                    return new(StatusCaptacao.Aguardando, criados);
                case TipoLeitura.AcessoNegado:
                    return new(StatusCaptacao.AcessoNegado, criados);
                case TipoLeitura.CanalNaoEncontrado:
                    return new(StatusCaptacao.CanalNaoEncontrado, criados);
                case TipoLeitura.Erro:
                    return new(StatusCaptacao.Erro, criados);
            }

            criados += await GravarAsync(config, leitura.Mensagens, temChaveDeIa, ct);

            if (leitura.EsperarPor is { } espera)
            {
                _esperas.Definir(workspaceId, _relogio.GetUtcNow() + espera);
                break;
            }

            if (leitura.Mensagens.Count < _canal.PorLeitura) break;
        }

        return new(StatusCaptacao.Lido, criados);
    }

    /// <summary>Cria os bugs e avança o cursor na mesma transação: ou grava tudo da página, ou nada.</summary>
    private async Task<int> GravarAsync(ConfiguracaoDiscord config, IReadOnlyList<MensagemDoCanal> mensagens, bool temChaveDeIa,
        CancellationToken ct)
    {
        if (mensagens.Count == 0) return 0;

        var ids = mensagens.Select(m => m.Id).ToList();
        var jaImportadas = (await _db.Bugs.IgnoreQueryFilters()
            .Where(b => b.WorkspaceId == config.WorkspaceId && b.MensagemExternaId != null && ids.Contains(b.MensagemExternaId))
            .Select(b => b.MensagemExternaId!)
            .ToListAsync(ct)).ToHashSet();

        var agora = _relogio.GetUtcNow();
        var cursor = config.UltimaMensagemId ?? Snowflake.De(config.ConfiguradoEm);
        var criados = 0;
        foreach (var m in mensagens)
        {
            // Defesa: nada anterior ao cursor (o Discord já não manda, mas o cursor nunca anda para trás).
            if (Snowflake.Valor(m.Id) <= Snowflake.Valor(cursor)) continue;
            config.UltimaMensagemId = Snowflake.Maior(config.UltimaMensagemId ?? cursor, m.Id);
            var texto = m.Texto.Trim();
            if (m.DeBot || texto.Length == 0 || !jaImportadas.Add(m.Id)) continue;

            var bug = new Bug
            {
                WorkspaceId = config.WorkspaceId,
                Titulo = Titulo(texto),
                Relato = texto.Length > BugsService.RelatoMaximo ? texto[..BugsService.RelatoMaximo] : texto,
                Origem = _canal.Origem,
                Status = StatusBug.ATriar,
                Severidade = SeveridadeBug.Media,
                Autor = string.IsNullOrWhiteSpace(m.Autor) ? null : Cortar(m.Autor.Trim(), AutorMaximo),
                MensagemExternaId = m.Id,
                CriadoEm = agora,
                AtualizadoEm = agora,
            };
            _db.Bugs.Add(bug);
            if (temChaveDeIa) FilaDeExtracao.Enfileirar(_db, bug, agora);
            criados++;
        }

        await _db.SaveChangesAsync(ct);
        return criados;
    }

    /// <summary>Primeira linha não vazia do relato, com espaços normalizados e cortada.</summary>
    public static string Titulo(string texto)
    {
        var linha = texto.Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0) ?? texto;
        linha = string.Join(' ', linha.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return Cortar(linha, TituloMaximo);
    }

    private static string Cortar(string s, int maximo) => s.Length <= maximo ? s : s[..(maximo - 1)].TrimEnd() + "…";
}
