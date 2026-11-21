using System.Linq.Expressions;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Portal.Api.Bugs;
using Portal.Api.Bugs.Discord;
using Portal.Api.Bugs.Extracao;
using Portal.Api.Dados.Entidades;
using Portal.Api.Integracoes.GitHub;
using Portal.Api.Perfil;
using Portal.Api.Roadmap;
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

    public DbSet<Convite> Convites => Set<Convite>();

    public DbSet<Repositorio> Repositorios => Set<Repositorio>();

    public DbSet<Deploy> Deploys => Set<Deploy>();

    public DbSet<PullRequest> PullRequests => Set<PullRequest>();

    public DbSet<ItemRoadmap> ItensRoadmap => Set<ItemRoadmap>();
    public DbSet<Bug> Bugs => Set<Bug>();

    /// <summary>Dados da pessoa (login do GitHub). Sem workspace: sempre consultado pelo usuário atual.</summary>
    public DbSet<PerfilUsuario> PerfisUsuario => Set<PerfilUsuario>();

    public DbSet<ConfiguracaoGitHub> ConfiguracoesGitHub => Set<ConfiguracaoGitHub>();

    public DbSet<ConfiguracaoDiscord> ConfiguracoesDiscord => Set<ConfiguracaoDiscord>();

    public DbSet<ConfiguracaoIa> ConfiguracoesIa => Set<ConfiguracaoIa>();

    /// <summary>Sugestões da IA por bug (P-026), separadas do que o humano confirmou no bug.</summary>
    public DbSet<SugestaoIa> SugestoesIa => Set<SugestaoIa>();

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
            e.Property(m => m.Email).HasColumnName("email").HasMaxLength(Convite.EmailMaximo);
            e.HasOne<Workspace>().WithMany().HasForeignKey(m => m.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(m => m.UsuarioId);
        });

        modelBuilder.Entity<Convite>(e =>
        {
            e.ToTable("convites");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id");
            e.Property(c => c.WorkspaceId).HasColumnName("workspace_id");
            e.Property(c => c.Email).HasColumnName("email").HasMaxLength(Convite.EmailMaximo).IsRequired();
            e.Property(c => c.Papel).HasColumnName("papel").HasMaxLength(20).IsRequired();
            e.Property(c => c.TokenHash).HasColumnName("token_hash").IsRequired();
            e.Property(c => c.CriadoPor).HasColumnName("criado_por");
            e.Property(c => c.CriadoEm).HasColumnName("criado_em");
            e.Property(c => c.ExpiraEm).HasColumnName("expira_em");
            e.Property(c => c.UsadoEm).HasColumnName("usado_em");
            e.Property(c => c.UsadoPor).HasColumnName("usado_por");
            e.HasOne<Workspace>().WithMany().HasForeignKey(c => c.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => c.TokenHash).IsUnique();
            e.HasIndex(c => new { c.WorkspaceId, c.UsadoEm, c.ExpiraEm });
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

        modelBuilder.Entity<ItemRoadmap>(e =>
        {
            e.ToTable("itens_roadmap");
            e.HasKey(i => i.Id);
            e.Property(i => i.Id).HasColumnName("id");
            e.Property(i => i.WorkspaceId).HasColumnName("workspace_id");
            e.Property(i => i.Titulo).HasColumnName("titulo").HasMaxLength(200).IsRequired();
            e.Property(i => i.Descricao).HasColumnName("descricao");
            e.Property(i => i.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            e.Property(i => i.Prazo).HasColumnName("prazo");
            e.Property(i => i.Progresso).HasColumnName("progresso");
            e.Property(i => i.DeployId).HasColumnName("deploy_id");
            e.Property(i => i.PullRequestId).HasColumnName("pull_request_id");
            e.Property(i => i.CriadoEm).HasColumnName("criado_em");
            e.Property(i => i.AtualizadoEm).HasColumnName("atualizado_em");
            e.HasOne<Workspace>().WithMany().HasForeignKey(i => i.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Deploy>().WithMany().HasForeignKey(i => i.DeployId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne<PullRequest>().WithMany().HasForeignKey(i => i.PullRequestId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => new { i.WorkspaceId, i.Status });
            e.HasIndex(i => i.DeployId);
            e.HasIndex(i => i.PullRequestId);
        });

        modelBuilder.Entity<Bug>(e =>
        {
            e.ToTable("bugs");
            e.HasKey(b => b.Id);
            e.Property(b => b.Id).HasColumnName("id");
            e.Property(b => b.WorkspaceId).HasColumnName("workspace_id");
            e.Property(b => b.Titulo).HasColumnName("titulo").HasMaxLength(BugsService.TituloMaximo).IsRequired();
            e.Property(b => b.Relato).HasColumnName("relato").HasMaxLength(BugsService.RelatoMaximo).IsRequired();
            e.Property(b => b.Passos).HasColumnName("passos").HasMaxLength(BugsService.CampoMaximo).IsRequired();
            e.Property(b => b.Esperado).HasColumnName("esperado").HasMaxLength(BugsService.CampoMaximo).IsRequired();
            e.Property(b => b.Obtido).HasColumnName("obtido").HasMaxLength(BugsService.CampoMaximo).IsRequired();
            e.Property(b => b.Severidade).HasColumnName("severidade").HasMaxLength(20).IsRequired()
                .HasConversion(v => TextoBug.Para(v), t => TextoBug.Severidade(t)!.Value);
            e.Property(b => b.Origem).HasColumnName("origem").HasMaxLength(20).IsRequired()
                .HasConversion(v => TextoBug.Para(v), t => TextoBug.Origem(t)!.Value);
            e.Property(b => b.Status).HasColumnName("status").HasMaxLength(20).IsRequired()
                .HasConversion(v => TextoBug.Para(v), t => TextoBug.Status(t)!.Value);
            e.Property(b => b.CriadoEm).HasColumnName("criado_em");
            e.Property(b => b.AtualizadoEm).HasColumnName("atualizado_em");
            e.Property(b => b.Autor).HasColumnName("autor").HasMaxLength(ImportadorDoDiscord.AutorMaximo);
            e.Property(b => b.MensagemExternaId).HasColumnName("mensagem_externa_id").HasMaxLength(32);
            e.HasOne<Workspace>().WithMany().HasForeignKey(b => b.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(b => new { b.WorkspaceId, b.Status });
            // Deduplicação do bot (P-025): a mesma mensagem nunca vira dois bugs no workspace.
            e.HasIndex(b => new { b.WorkspaceId, b.MensagemExternaId }).IsUnique().HasFilter("mensagem_externa_id IS NOT NULL");
        });

        modelBuilder.Entity<ConfiguracaoDiscord>(e =>
        {
            e.ToTable("configuracoes_discord");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id");
            e.Property(c => c.WorkspaceId).HasColumnName("workspace_id");
            e.Property(c => c.TokenCriptografado).HasColumnName("token_criptografado").IsRequired();
            e.Property(c => c.FinalToken).HasColumnName("final_token").HasMaxLength(4).IsRequired();
            e.Property(c => c.CanalId).HasColumnName("canal_id").HasMaxLength(20).IsRequired();
            e.Property(c => c.UltimaMensagemId).HasColumnName("ultima_mensagem_id").HasMaxLength(20);
            e.Property(c => c.ConfiguradoEm).HasColumnName("configurado_em");
            e.Property(c => c.UltimaLeitura).HasColumnName("ultima_leitura");
            e.Property(c => c.UltimoErro).HasColumnName("ultimo_erro");
            e.HasOne<Workspace>().WithMany().HasForeignKey(c => c.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => c.WorkspaceId).IsUnique();
        });

        modelBuilder.Entity<ConfiguracaoIa>(e =>
        {
            e.ToTable("configuracoes_ia");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id");
            e.Property(c => c.WorkspaceId).HasColumnName("workspace_id");
            e.Property(c => c.Provedor).HasColumnName("provedor").HasMaxLength(30).IsRequired();
            e.Property(c => c.ChaveCriptografada).HasColumnName("chave_criptografada").IsRequired();
            e.Property(c => c.ConfiguradoEm).HasColumnName("configurado_em");
            e.HasOne<Workspace>().WithMany().HasForeignKey(c => c.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(c => c.WorkspaceId).IsUnique();
        });

        modelBuilder.Entity<SugestaoIa>(e =>
        {
            e.ToTable("sugestoes_ia");
            e.HasKey(s => s.BugId);
            e.Property(s => s.BugId).HasColumnName("bug_id").ValueGeneratedNever();
            e.Property(s => s.WorkspaceId).HasColumnName("workspace_id");
            e.Property(s => s.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
            e.Property(s => s.Tentativas).HasColumnName("tentativas");
            e.Property(s => s.ProximaTentativaEm).HasColumnName("proxima_tentativa_em");
            e.Property(s => s.Passos).HasColumnName("passos").HasMaxLength(ExtratorDeRelato.CampoMaximo).IsRequired();
            e.Property(s => s.Esperado).HasColumnName("esperado").HasMaxLength(ExtratorDeRelato.CampoMaximo).IsRequired();
            e.Property(s => s.Obtido).HasColumnName("obtido").HasMaxLength(ExtratorDeRelato.CampoMaximo).IsRequired();
            e.Property(s => s.Ambiente).HasColumnName("ambiente").HasMaxLength(ExtratorDeRelato.AmbienteMaximo).IsRequired();
            e.Property(s => s.Severidade).HasColumnName("severidade").HasMaxLength(20);
            e.Property(s => s.Area).HasColumnName("area").HasMaxLength(ExtratorDeRelato.AreaMaxima);
            e.Property(s => s.Confianca).HasColumnName("confianca");
            e.Property(s => s.Evidencias).HasColumnName("evidencias");
            e.Property(s => s.Erro).HasColumnName("erro").HasMaxLength(200);
            e.Property(s => s.CriadoEm).HasColumnName("criado_em");
            e.Property(s => s.AtualizadoEm).HasColumnName("atualizado_em");
            e.HasOne<Bug>().WithOne().HasForeignKey<SugestaoIa>(s => s.BugId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Workspace>().WithMany().HasForeignKey(s => s.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => new { s.Status, s.ProximaTentativaEm });
            e.HasIndex(s => s.WorkspaceId);
        });

        modelBuilder.Entity<PerfilUsuario>(e =>
        {
            e.ToTable("perfis_usuario");
            e.HasKey(p => p.UsuarioId);
            e.Property(p => p.UsuarioId).HasColumnName("usuario_id").ValueGeneratedNever();
            e.Property(p => p.GithubLogin).HasColumnName("github_login").HasMaxLength(PerfilUsuario.GithubLoginMaximo);
            e.Property(p => p.MfaExigido).HasColumnName("mfa_exigido");
            e.Property(p => p.AtualizadoEm).HasColumnName("atualizado_em");
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
