using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Workspaces;

namespace Portal.Api.Dados;

public class PortalDbContext : DbContext
{
    private readonly WorkspaceAtual _workspaceAtual;

    public PortalDbContext(DbContextOptions options, WorkspaceAtual workspaceAtual) : base(options)
    {
        _workspaceAtual = workspaceAtual;
    }

    public DbSet<Workspace> Workspaces => Set<Workspace>();

    public DbSet<WorkspaceMembro> WorkspaceMembros => Set<WorkspaceMembro>();

    // Lido pelo query filter a cada consulta (o EF o trata como parâmetro, não como constante).
    private Guid WorkspaceIdAtual => _workspaceAtual.Id;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Workspace>(e =>
        {
            e.ToTable("workspaces");
            e.HasKey(w => w.Id);
            e.Property(w => w.Id).HasColumnName("id");
            e.Property(w => w.Nome).HasColumnName("nome").HasMaxLength(Workspace.NomeMaximo).IsRequired();
            e.Property(w => w.PessoalDe).HasColumnName("pessoal_de");
            e.Property(w => w.CriadoEm).HasColumnName("criado_em");
            e.HasIndex(w => w.PessoalDe).IsUnique();
        });

        modelBuilder.Entity<WorkspaceMembro>(e =>
        {
            e.ToTable("workspace_membros");
            e.HasKey(m => new { m.WorkspaceId, m.UsuarioId });
            e.Property(m => m.WorkspaceId).HasColumnName("workspace_id");
            e.Property(m => m.UsuarioId).HasColumnName("usuario_id");
            e.Property(m => m.Papel).HasColumnName("papel").HasMaxLength(20).IsRequired();
            e.HasOne<Workspace>().WithMany().HasForeignKey(m => m.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(m => m.UsuarioId);
        });

        AplicarFiltroPorWorkspace(modelBuilder);
    }

    // Toda entidade de negócio (com WorkspaceId) só enxerga o workspace atual.
    // WorkspaceMembro fica de fora: é consultada justamente para descobrir a que workspaces o usuário pertence.
    private void AplicarFiltroPorWorkspace(ModelBuilder modelBuilder)
    {
        foreach (var tipo in modelBuilder.Model.GetEntityTypes().ToList())
        {
            if (tipo.ClrType == typeof(WorkspaceMembro) || tipo.ClrType.GetProperty("WorkspaceId")?.PropertyType != typeof(Guid))
                continue;

            var e = Expression.Parameter(tipo.ClrType, "e");
            var filtro = Expression.Lambda(
                Expression.Equal(
                    Expression.Property(e, "WorkspaceId"),
                    Expression.Property(Expression.Constant(this, typeof(PortalDbContext)), nameof(WorkspaceIdAtual))),
                e);
            modelBuilder.Entity(tipo.ClrType).HasQueryFilter(filtro);
        }
    }
}
