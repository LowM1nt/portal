using System.Linq.Expressions;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Dados.Entidades;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Workspaces;

namespace Portal.Api.Dados;

public class PortalDbContext : DbContext, IDataProtectionKeyContext
{
    private readonly WorkspaceAtual _workspaceAtual;

    public PortalDbContext(DbContextOptions options, WorkspaceAtual workspaceAtual) : base(options)
    {
        _workspaceAtual = workspaceAtual;
    }

    public DbSet<Workspace> Workspaces => Set<Workspace>();

    public DbSet<WorkspaceMembro> WorkspaceMembros => Set<WorkspaceMembro>();

    public DbSet<Repositorio> Repositorios => Set<Repositorio>();

    public DbSet<Deploy> Deploys => Set<Deploy>();

    public DbSet<PullRequest> PullRequests => Set<PullRequest>();

    public DbSet<ConfiguracaoGitHub> ConfiguracoesGitHub => Set<ConfiguracaoGitHub>();

    /// <summary>Chaves do Data Protection (cifram o token do GitHub). Sobrevivem a reinícios e a várias instâncias.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    // Lido pelo query filter a cada consulta (o EF o trata como parâmetro, não como constante).
    private Guid WorkspaceIdAtual => _workspaceAtual.Id;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DataProtectionKey>(e =>
        {
            e.ToTable("chaves_protecao_dados");
            e.HasKey(k => k.Id);
            e.Property(k => k.Id).HasColumnName("id");
            e.Property(k => k.FriendlyName).HasColumnName("nome");
            e.Property(k => k.Xml).HasColumnName("xml");
        });

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

        modelBuilder.Entity<Repositorio>(e =>
        {
            e.ToTable("repositorios");
            e.HasKey(r => r.Id);
            e.Property(r => r.Id).HasColumnName("id");
            e.Property(r => r.WorkspaceId).HasColumnName("workspace_id");
            e.Property(r => r.Nome).HasColumnName("nome").HasMaxLength(200).IsRequired();
            e.Property(r => r.CriadoEm).HasColumnName("criado_em");
            e.HasIndex(r => r.WorkspaceId);
        });

        modelBuilder.Entity<Deploy>(e =>
        {
            e.ToTable("deploys");
            e.HasKey(d => d.Id);
            e.Property(d => d.Id).HasColumnName("id");
            e.Property(d => d.WorkspaceId).HasColumnName("workspace_id");
            e.Property(d => d.RepositorioId).HasColumnName("repositorio_id");
            e.Property(d => d.Titulo).HasColumnName("titulo").HasMaxLength(200).IsRequired();
            e.Property(d => d.Ambiente).HasColumnName("ambiente").HasMaxLength(50).IsRequired();
            e.Property(d => d.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
            e.Property(d => d.AgendadoPara).HasColumnName("agendado_para");
            e.Property(d => d.CriadoEm).HasColumnName("criado_em");
            e.HasOne<Repositorio>().WithMany().HasForeignKey(d => d.RepositorioId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(d => d.WorkspaceId);
            e.HasIndex(d => new { d.WorkspaceId, d.AgendadoPara });
            e.HasIndex(d => d.RepositorioId);
        });

        modelBuilder.Entity<PullRequest>(e =>
        {
            e.ToTable("pull_requests");
            e.HasKey(p => p.Id);
            e.Property(p => p.Id).HasColumnName("id");
            e.Property(p => p.WorkspaceId).HasColumnName("workspace_id");
            e.Property(p => p.RepositorioId).HasColumnName("repositorio_id");
            e.Property(p => p.Numero).HasColumnName("numero");
            e.Property(p => p.Titulo).HasColumnName("titulo").HasMaxLength(300).IsRequired();
            e.Property(p => p.Autor).HasColumnName("autor").HasMaxLength(100).IsRequired();
            e.Property(p => p.Estado).HasColumnName("estado").HasMaxLength(50).IsRequired();
            e.Property(p => p.CriadoEm).HasColumnName("criado_em");
            e.Property(p => p.StatusCi).HasColumnName("status_ci").HasMaxLength(20).IsRequired();
            e.Property(p => p.ShaUltimoCommit).HasColumnName("sha_ultimo_commit").HasMaxLength(40);
            e.Property(p => p.Draft).HasColumnName("draft");
            e.Property(p => p.RevisoresSolicitados).HasColumnName("revisores_solicitados");
            e.Property(p => p.EquipesSolicitadas).HasColumnName("equipes_solicitadas");
            e.HasOne<Repositorio>().WithMany().HasForeignKey(p => p.RepositorioId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(p => p.WorkspaceId);
            e.HasIndex(p => new { p.WorkspaceId, p.CriadoEm });
            e.HasIndex(p => new { p.WorkspaceId, p.RepositorioId, p.Numero }).IsUnique();
            e.HasIndex(p => p.RepositorioId);
        });

        modelBuilder.Entity<ConfiguracaoGitHub>(e =>
        {
            e.ToTable("configuracoes_github");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id");
            e.Property(c => c.WorkspaceId).HasColumnName("workspace_id");
            e.Property(c => c.TokenCriptografado).HasColumnName("token_criptografado").IsRequired();
            e.Property(c => c.FinalToken).HasColumnName("final_token").HasMaxLength(4).IsRequired();
            e.Property(c => c.Repositorios).HasColumnName("repositorios");
            e.Property(c => c.ConfiguradoEm).HasColumnName("configurado_em");
            e.Property(c => c.UltimaSincronizacao).HasColumnName("ultima_sincronizacao");
            e.Property(c => c.UltimoErro).HasColumnName("ultimo_erro");
            e.HasOne<Workspace>().WithMany().HasForeignKey(c => c.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => c.WorkspaceId).IsUnique();
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
