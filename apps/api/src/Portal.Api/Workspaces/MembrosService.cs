using System.Net.Mail;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Auth;
using Portal.Api.Dados;
using Portal.Api.Deploys;

namespace Portal.Api.Workspaces;

public record MembroDto(Guid UsuarioId, string? Email, string Papel, bool Voce);

public record ConvitePedido(string? Email, string? Papel);

public record ConviteCriadoDto(Guid Id, string Email, string Papel, DateTimeOffset ExpiraEm, string Link);

public record AceitarConvitePedido(string? Token);

public record ConviteAceitoDto(Guid WorkspaceId, string Nome, string Papel);

public record PapelPedido(string? Papel);

/// <summary>Membros e convites do workspace (D-011). Toda consulta filtra pelo workspace recebido do filtro da rota.</summary>
public class MembrosService
{
    public const int ConvitesPendentesMaximos = 50;
    public const int TokenBytes = 32;
    public static readonly TimeSpan ValidadeDoConvite = TimeSpan.FromDays(7);

    // Mesma mensagem para token inexistente, malformado, expirado, já usado ou de outro e-mail: não revela qual foi.
    public const string ConviteInvalido = "Convite inválido ou expirado. Peça um novo convite ao dono do workspace.";

    private static readonly string[] PapeisDeConvite = [Papeis.Membro, Papeis.Admin];

    private readonly PortalDbContext _db;
    private readonly UsuarioAtual _usuario;
    private readonly TimeProvider _relogio;
    private readonly IEnviadorDeEmail _email;
    private readonly IConfiguration _config;

    public MembrosService(PortalDbContext db, UsuarioAtual usuario, TimeProvider relogio, IEnviadorDeEmail email, IConfiguration config)
    {
        _db = db;
        _usuario = usuario;
        _relogio = relogio;
        _email = email;
        _config = config;
    }

    /// <summary>E-mail aparado e em minúsculas; null se vazio ou longo demais.</summary>
    public static string? NormalizarEmail(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(e) || e.Length > Convite.EmailMaximo ? null : e;
    }

    public async Task<List<MembroDto>> ListarAsync(Guid workspaceId, CancellationToken ct)
    {
        var membros = await _db.WorkspaceMembros.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId)
            .ToListAsync(ct);
        return membros
            .OrderBy(m => Array.IndexOf(Papeis.Todos, m.Papel)).ThenBy(m => m.Email).ThenBy(m => m.UsuarioId)
            .Select(m => new MembroDto(m.UsuarioId, m.Email, m.Papel, m.UsuarioId == _usuario.Id))
            .ToList();
    }

    public async Task<Resultado<ConviteCriadoDto>> ConvidarAsync(Guid workspaceId, ConvitePedido pedido, CancellationToken ct)
    {
        var email = NormalizarEmail(pedido.Email);
        if (email is null || !MailAddress.TryCreate(email, out var endereco) || endereco.Address != email)
            return new(ResultadoTipo.Invalido, Erro: "Informe um e-mail válido.");
        var papel = pedido.Papel?.Trim().ToLowerInvariant() ?? Papeis.Membro;
        if (!PapeisDeConvite.Contains(papel))
            return new(ResultadoTipo.Invalido, Erro: "Papel inválido. Use membro ou admin.");

        var agora = _relogio.GetUtcNow();
        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await TravarWorkspaceAsync(workspaceId, ct);

        var pendentes = await _db.Convites
            .CountAsync(c => c.WorkspaceId == workspaceId && c.UsadoEm == null && c.ExpiraEm > agora, ct);
        if (pendentes >= ConvitesPendentesMaximos)
            return new(ResultadoTipo.Invalido,
                Erro: $"Este workspace já tem {ConvitesPendentesMaximos} convites pendentes. Espere alguns serem aceitos ou expirarem.");
        if (await _db.WorkspaceMembros.AnyAsync(m => m.WorkspaceId == workspaceId && m.Email == email, ct))
            return new(ResultadoTipo.Conflito, Erro: "Essa pessoa já faz parte do workspace.");

        var bytes = RandomNumberGenerator.GetBytes(TokenBytes);
        var token = WebEncoders.Base64UrlEncode(bytes);
        var convite = new Convite
        {
            WorkspaceId = workspaceId,
            Email = email,
            Papel = papel,
            TokenHash = SHA256.HashData(bytes),
            CriadoPor = _usuario.Id,
            CriadoEm = agora,
            ExpiraEm = agora + ValidadeDoConvite,
        };
        _db.Convites.Add(convite);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var link = $"{UrlDoWeb()}/convite#token={token}";
        var nome = await _db.Workspaces.Where(w => w.Id == workspaceId).Select(w => w.Nome).FirstAsync(ct);
        await _email.EnviarConviteAsync(email, nome, link, ct);
        return new(ResultadoTipo.Ok, new ConviteCriadoDto(convite.Id, email, papel, convite.ExpiraEm, link));
    }

    public async Task<Resultado<ConviteAceitoDto>> AceitarAsync(AceitarConvitePedido pedido, CancellationToken ct)
    {
        var hash = HashDoToken(pedido.Token);
        var email = NormalizarEmail(_usuario.Email);
        if (hash is null || email is null) return new(ResultadoTipo.Invalido, Erro: ConviteInvalido);

        var agora = _relogio.GetUtcNow();
        // O convite não tem workspace atual (quem aceita ainda não é membro): busca direto pelo hash.
        var convite = await _db.Convites.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.TokenHash == hash, ct);
        if (convite is null || convite.UsadoEm is not null || convite.ExpiraEm <= agora || convite.Email != email)
            return new(ResultadoTipo.Invalido, Erro: ConviteInvalido);

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        // UPDATE condicional: com dois aceites simultâneos, o segundo espera a trava da linha e não encontra mais usado_em nulo.
        var marcados = await _db.Convites.IgnoreQueryFilters()
            .Where(c => c.Id == convite.Id && c.UsadoEm == null && c.ExpiraEm > agora)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.UsadoEm, (DateTimeOffset?)agora)
                .SetProperty(c => c.UsadoPor, (Guid?)_usuario.Id), ct);
        if (marcados == 0) return new(ResultadoTipo.Invalido, Erro: ConviteInvalido);

        if (await _db.WorkspaceMembros.AnyAsync(m => m.WorkspaceId == convite.WorkspaceId && m.UsuarioId == _usuario.Id, ct))
            return new(ResultadoTipo.Conflito, Erro: "Você já faz parte deste workspace.");

        _db.WorkspaceMembros.Add(new WorkspaceMembro
        {
            WorkspaceId = convite.WorkspaceId,
            UsuarioId = _usuario.Id,
            Papel = convite.Papel,
            Email = email,
        });
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Outro convite do mesmo workspace aceito ao mesmo tempo pela mesma pessoa: a chave primária barrou.
            return new(ResultadoTipo.Conflito, Erro: "Você já faz parte deste workspace.");
        }
        await tx.CommitAsync(ct);

        var nome = await _db.Workspaces.Where(w => w.Id == convite.WorkspaceId).Select(w => w.Nome).FirstAsync(ct);
        return new(ResultadoTipo.Ok, new ConviteAceitoDto(convite.WorkspaceId, nome, convite.Papel));
    }

    public async Task<Resultado<MembroDto>> MudarPapelAsync(Guid workspaceId, Guid usuarioId, PapelPedido pedido, CancellationToken ct)
    {
        var papel = pedido.Papel?.Trim().ToLowerInvariant();
        if (papel is null || !Papeis.Todos.Contains(papel))
            return new(ResultadoTipo.Invalido, Erro: "Papel inválido. Use dono, admin ou membro.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await TravarWorkspaceAsync(workspaceId, ct);
        var membro = await _db.WorkspaceMembros
            .FirstOrDefaultAsync(m => m.WorkspaceId == workspaceId && m.UsuarioId == usuarioId, ct);
        if (membro is null) return new(ResultadoTipo.NaoEncontrado);

        if (membro.Papel == Papeis.Dono && papel != Papeis.Dono && await ContarDonosAsync(workspaceId, ct) <= 1)
            return new(ResultadoTipo.Conflito, Erro: "O workspace precisa de pelo menos um dono. Promova outra pessoa a dono antes.");

        membro.Papel = papel;
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(ResultadoTipo.Ok, new MembroDto(membro.UsuarioId, membro.Email, membro.Papel, membro.UsuarioId == _usuario.Id));
    }

    public async Task<Resultado<bool>> RemoverAsync(Guid workspaceId, Guid usuarioId, CancellationToken ct)
    {
        if (usuarioId == _usuario.Id)
            return new(ResultadoTipo.Invalido, Erro: "Você não pode remover a si mesmo do workspace.");

        await using var tx = await _db.Database.BeginTransactionAsync(ct);
        await TravarWorkspaceAsync(workspaceId, ct);
        var membro = await _db.WorkspaceMembros
            .FirstOrDefaultAsync(m => m.WorkspaceId == workspaceId && m.UsuarioId == usuarioId, ct);
        if (membro is null) return new(ResultadoTipo.NaoEncontrado);

        // Quem remove é dono e não é o removido, então sempre sobra um dono; a checagem fica como defesa.
        if (membro.Papel == Papeis.Dono && await ContarDonosAsync(workspaceId, ct) <= 1)
            return new(ResultadoTipo.Conflito, Erro: "O workspace precisa de pelo menos um dono.");

        _db.WorkspaceMembros.Remove(membro);
        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(ResultadoTipo.Ok, true);
    }

    private Task<int> ContarDonosAsync(Guid workspaceId, CancellationToken ct) =>
        _db.WorkspaceMembros.CountAsync(m => m.WorkspaceId == workspaceId && m.Papel == Papeis.Dono, ct);

    // Serializa as mudanças de membros e convites do mesmo workspace (limite de pendentes e "último dono").
    private Task TravarWorkspaceAsync(Guid workspaceId, CancellationToken ct) =>
        _db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM workspaces WHERE id = {workspaceId} FOR UPDATE", ct);

    private static byte[]? HashDoToken(string? token)
    {
        // 32 bytes em Base64Url sem preenchimento = 43 caracteres.
        if (token is null || token.Length != 43) return null;
        try
        {
            var bytes = WebEncoders.Base64UrlDecode(token);
            return bytes.Length == TokenBytes ? SHA256.HashData(bytes) : null;
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private string UrlDoWeb() =>
        (_config["Web:Url"] ?? _config["Cors:Origem"] ?? "http://localhost:5173").TrimEnd('/');
}
