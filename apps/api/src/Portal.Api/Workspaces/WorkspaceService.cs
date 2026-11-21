using Microsoft.EntityFrameworkCore;
using Portal.Api.Auth;
using Portal.Api.Dados;

namespace Portal.Api.Workspaces;

public record WorkspaceDto(Guid Id, string Nome, string Papel);

public record MeDto(Guid UsuarioId, string? Email, List<WorkspaceDto> Workspaces);

public class WorkspaceService
{
    public const int WorkspacesMaximosPorUsuario = 20;

    private readonly PortalDbContext _db;
    private readonly UsuarioAtual _usuario;

    public WorkspaceService(PortalDbContext db, UsuarioAtual usuario)
    {
        _db = db;
        _usuario = usuario;
    }

    public async Task<MeDto> ObterMeAsync(CancellationToken ct)
    {
        await GarantirWorkspacePessoalAsync(ct);
        var workspaces = await Meus().ToListAsync(ct);
        return new MeDto(_usuario.Id, _usuario.Email, workspaces);
    }

    /// <summary>Workspaces em que o usuário é dono (o pessoal conta).</summary>
    public Task<int> ContarComoDonoAsync(CancellationToken ct) =>
        _db.WorkspaceMembros.CountAsync(m => m.UsuarioId == _usuario.Id && m.Papel == Papeis.Dono, ct);

    public async Task<WorkspaceDto> CriarAsync(string nome, CancellationToken ct)
    {
        var workspace = Novo(nome, pessoalDe: null);
        await _db.SaveChangesAsync(ct);
        return new WorkspaceDto(workspace.Id, workspace.Nome, Papeis.Dono);
    }

    /// <summary>Devolve null tanto para id inexistente quanto para quem não é membro (404 nos dois casos).</summary>
    public async Task<WorkspaceDto?> ObterAsync(Guid id, CancellationToken ct) =>
        await Meus(id).Cast<WorkspaceDto?>().FirstOrDefaultAsync(ct);

    // Sempre parte dos vínculos do usuário atual: nunca lê workspace sem filtrar pelo membro.
    private IQueryable<WorkspaceDto> Meus(Guid? id = null) =>
        from m in _db.WorkspaceMembros
        where m.UsuarioId == _usuario.Id && (id == null || m.WorkspaceId == id)
        join w in _db.Workspaces on m.WorkspaceId equals w.Id
        orderby w.Nome, w.Id
        select new WorkspaceDto(w.Id, w.Nome, m.Papel);

    private Workspace Novo(string nome, Guid? pessoalDe)
    {
        var workspace = new Workspace { Nome = nome, PessoalDe = pessoalDe };
        _db.Workspaces.Add(workspace);
        _db.WorkspaceMembros.Add(new WorkspaceMembro
        {
            WorkspaceId = workspace.Id,
            UsuarioId = _usuario.Id,
            Papel = Papeis.Dono,
            Email = MembrosService.NormalizarEmail(_usuario.Email),
        });
        return workspace;
    }

    private async Task GarantirWorkspacePessoalAsync(CancellationToken ct)
    {
        if (await _db.Workspaces.AnyAsync(w => w.PessoalDe == _usuario.Id, ct)) return;

        Novo("Meu workspace", _usuario.Id);
        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Duas requisições simultâneas no 1º acesso: o índice único em pessoal_de deixou só uma passar.
            _db.ChangeTracker.Clear();
            if (!await _db.Workspaces.AnyAsync(w => w.PessoalDe == _usuario.Id, ct)) throw;
        }
    }
}
