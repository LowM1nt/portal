using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Auth;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Perfil;

public record GithubLoginPedido(string? Login);

public record GithubLoginResposta(string? GithubLogin);

public partial class PerfilService
{
    private readonly PortalDbContext _db;
    private readonly UsuarioAtual _usuario;
    private readonly TimeProvider _relogio;

    public PerfilService(PortalDbContext db, UsuarioAtual usuario, TimeProvider relogio)
    {
        _db = db;
        _usuario = usuario;
        _relogio = relogio;
    }

    // Regra do GitHub: 1 a 39 letras, números ou hífens; sem hífen no começo, no fim ou dois seguidos.
    [GeneratedRegex("^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")]
    private static partial Regex FormatoLogin();

    public Task<string?> ObterGithubLoginAsync(CancellationToken ct) =>
        _db.PerfisUsuario.AsNoTracking()
            .Where(p => p.UsuarioId == _usuario.Id)
            .Select(p => p.GithubLogin)
            .FirstOrDefaultAsync(ct);

    /// <summary>Guarda (ou, com login vazio, apaga) o login do GitHub de quem está logado. Aceita "@login".</summary>
    public async Task<Resultado<GithubLoginResposta>> SalvarGithubLoginAsync(GithubLoginPedido pedido, CancellationToken ct)
    {
        var login = pedido.Login?.Trim();
        if (login?.StartsWith('@') == true) login = login[1..];
        if (string.IsNullOrEmpty(login)) login = null;
        else if (!FormatoLogin().IsMatch(login))
            return new(ResultadoTipo.Invalido,
                Erro: "Esse não parece um usuário do GitHub. Use só letras, números e hífens (até 39), como em github.com/seu-usuario.");

        var perfil = await _db.PerfisUsuario.FirstOrDefaultAsync(p => p.UsuarioId == _usuario.Id, ct);
        if (perfil is null)
        {
            perfil = new PerfilUsuario { UsuarioId = _usuario.Id };
            _db.PerfisUsuario.Add(perfil);
        }
        perfil.GithubLogin = login;
        perfil.AtualizadoEm = _relogio.GetUtcNow();
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Dois PUTs simultâneos no 1º uso: a chave primária deixou só um criar; o outro atualiza.
            _db.ChangeTracker.Clear();
            await _db.PerfisUsuario.Where(p => p.UsuarioId == _usuario.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.GithubLogin, login).SetProperty(p => p.AtualizadoEm, _relogio.GetUtcNow()), ct);
        }
        return new(ResultadoTipo.Ok, new GithubLoginResposta(login));
    }
}
