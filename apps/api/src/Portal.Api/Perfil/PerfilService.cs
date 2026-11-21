using System.Linq.Expressions;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query;
using Portal.Api.Auth;
using Portal.Api.Dados;
using Portal.Api.Deploys;
using Portal.Api.Seguranca;

namespace Portal.Api.Perfil;

public record GithubLoginPedido(string? Login);

public record GithubLoginResposta(string? GithubLogin);

public record MfaPedido(bool? Exigir);

public record MfaResposta(bool MfaExigido);

public partial class PerfilService
{
    private readonly PortalDbContext _db;
    private readonly UsuarioAtual _usuario;
    private readonly TimeProvider _relogio;
    private readonly CacheMfa _cacheMfa;

    public PerfilService(PortalDbContext db, UsuarioAtual usuario, TimeProvider relogio, CacheMfa cacheMfa)
    {
        _db = db;
        _usuario = usuario;
        _relogio = relogio;
        _cacheMfa = cacheMfa;
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

        var agora = _relogio.GetUtcNow();
        await SalvarPerfilAsync(p => p.GithubLogin = login,
            s => s.SetProperty(p => p.GithubLogin, login).SetProperty(p => p.AtualizadoEm, agora), ct);
        return new(ResultadoTipo.Ok, new GithubLoginResposta(login));
    }

    /// <summary>
    /// Liga ou desliga a exigência de duas etapas na API para quem está logado. Quem chama já confirmou que o token é
    /// aal2. O cache do filtro desta instância é atualizado na hora.
    /// </summary>
    public async Task<Resultado<MfaResposta>> SalvarMfaExigidoAsync(MfaPedido pedido, CancellationToken ct)
    {
        if (pedido.Exigir is not { } exigir)
            return new(ResultadoTipo.Invalido, Erro: "Informe exigir: true ou false.");

        var agora = _relogio.GetUtcNow();
        await SalvarPerfilAsync(p => p.MfaExigido = exigir,
            s => s.SetProperty(p => p.MfaExigido, exigir).SetProperty(p => p.AtualizadoEm, agora), ct);
        _cacheMfa.Definir(_usuario.Id, exigir);
        return new(ResultadoTipo.Ok, new MfaResposta(exigir));
    }

    // Cria o perfil no 1º uso ou atualiza o existente, sempre pelo sub do JWT.
    private async Task SalvarPerfilAsync(
        Action<PerfilUsuario> aplicar,
        Expression<Func<SetPropertyCalls<PerfilUsuario>, SetPropertyCalls<PerfilUsuario>>> emConflito,
        CancellationToken ct)
    {
        var perfil = await _db.PerfisUsuario.FirstOrDefaultAsync(p => p.UsuarioId == _usuario.Id, ct);
        if (perfil is null)
        {
            perfil = new PerfilUsuario { UsuarioId = _usuario.Id };
            _db.PerfisUsuario.Add(perfil);
        }
        aplicar(perfil);
        perfil.AtualizadoEm = _relogio.GetUtcNow();
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Dois PUTs simultâneos no 1º uso: a chave primária deixou só um criar; o outro atualiza.
            _db.ChangeTracker.Clear();
            await _db.PerfisUsuario.Where(p => p.UsuarioId == _usuario.Id).ExecuteUpdateAsync(emConflito, ct);
        }
    }
}
