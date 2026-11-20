using System.Collections;
using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Dados;

[Collection("postgres")]
public class ModeloDadosTests
{
    private static readonly string[] Tabelas = ["repositorios", "deploys", "pull_requests"];

    private readonly PostgresFixture _pg;

    public ModeloDadosTests(PostgresFixture pg) => _pg = pg;

    private async Task<(ApiFactory api, string conexao)> BancoMigradoAsync()
    {
        var conexao = await _pg.NovoBancoAsync();
        var api = new ApiFactory("Testing", conexao);
        await api.MigrarAsync();
        return (api, conexao);
    }

    private static async Task<List<string[]>> ConsultarAsync(string conexao, string sql, params object[] parametros)
    {
        var linhas = new List<string[]>();
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, c);
        for (var i = 0; i < parametros.Length; i++) cmd.Parameters.AddWithValue($"p{i}", parametros[i]);
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            linhas.Add(Enumerable.Range(0, r.FieldCount).Select(i => r.GetValue(i)?.ToString() ?? "").ToArray());
        return linhas;
    }

    private static async Task ExecutarAsync(string conexao, string sql, params object[] parametros)
    {
        await using var c = new NpgsqlConnection(conexao);
        await c.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, c);
        for (var i = 0; i < parametros.Length; i++) cmd.Parameters.AddWithValue($"p{i}", parametros[i]);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<List<string>> DefinicoesDeIndicesAsync(string conexao, string tabela) =>
        (await ConsultarAsync(conexao, "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = @p0", tabela))
        .Select(l => l[0]).ToList();

    private static string ColunasDoIndice(string indexdef)
    {
        var ini = indexdef.IndexOf('(') + 1;
        var fim = indexdef.LastIndexOf(')');
        return indexdef[ini..fim].Replace("\"", "").Replace(" ", "");
    }

    [Fact]
    public async Task Migrations_aplicam_do_zero_e_criam_as_tres_tabelas()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;

        var existentes = await _pg.TabelasAsync(conexao);
        foreach (var t in Tabelas) Assert.Contains(t, existentes);
    }

    [Fact]
    public async Task Cada_tabela_tem_workspace_id_e_um_indice_que_comeca_por_ela()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;

        foreach (var tabela in Tabelas)
        {
            var colunas = (await ConsultarAsync(conexao,
                "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0", tabela))
                .Select(l => l[0]).ToList();
            Assert.Contains("workspace_id", colunas);

            var indices = await DefinicoesDeIndicesAsync(conexao, tabela);
            Assert.Contains(indices, d => ColunasDoIndice(d).StartsWith("workspace_id"));
        }
    }

    [Fact]
    public async Task Existem_indices_por_data_em_deploys_e_pull_requests()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;

        var deploys = (await DefinicoesDeIndicesAsync(conexao, "deploys")).Select(ColunasDoIndice);
        var prs = (await DefinicoesDeIndicesAsync(conexao, "pull_requests")).Select(ColunasDoIndice);

        Assert.Contains("workspace_id,agendado_para", deploys);
        Assert.Contains("workspace_id,criado_em", prs);
    }

    [Fact]
    public async Task Nenhuma_tabela_tem_coluna_duplicada()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;

        foreach (var tabela in Tabelas)
        {
            var colunas = (await ConsultarAsync(conexao,
                "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0", tabela))
                .Select(l => l[0]).ToList();
            Assert.NotEmpty(colunas);
            Assert.Equal(colunas.Count, colunas.Distinct().Count());
            // Só uma coluna de data de criação, e nenhuma variante do workspace.
            Assert.Single(colunas, c => c == "workspace_id");
            Assert.DoesNotContain(colunas, c => c.StartsWith("workspace_id") && c != "workspace_id");
            Assert.DoesNotContain(colunas, c => c is "criado_em1" or "created_at" or "criado_em_utc");
        }
    }

    [Fact]
    public async Task Query_filter_nao_devolve_deploys_de_outro_workspace()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;
        var ws1 = Guid.NewGuid();
        var ws2 = Guid.NewGuid();
        var agora = DateTime.UtcNow;

        foreach (var (ws, nome) in new[] { (ws1, "Um"), (ws2, "Dois") })
        {
            await ExecutarAsync(conexao, "INSERT INTO workspaces (id, nome, criado_em) VALUES (@p0, @p1, @p2)", ws, nome, agora);
            var repo = Guid.NewGuid();
            await ExecutarAsync(conexao,
                "INSERT INTO repositorios (id, workspace_id, nome, criado_em) VALUES (@p0, @p1, @p2, @p3)", repo, ws, "repo-" + nome, agora);
            await ExecutarAsync(conexao,
                "INSERT INTO deploys (id, workspace_id, repositorio_id, titulo, ambiente, status, agendado_para, criado_em) " +
                "VALUES (@p0, @p1, @p2, @p3, 'producao', 'agendado', @p4, @p5)", Guid.NewGuid(), ws, repo, "Deploy " + nome, agora, agora);
        }

        using var escopo = api.Services.CreateScope();
        escopo.ServiceProvider.GetRequiredService<WorkspaceAtual>().Definir(ws1);
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();

        var tipo = db.Model.GetEntityTypes().Single(t => t.GetTableName() == "deploys").ClrType;
        var set = (IEnumerable)typeof(DbContext).GetMethods()
            .Single(m => m.Name == "Set" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0)
            .MakeGenericMethod(tipo).Invoke(db, null)!;
        var linhas = set.Cast<object>().ToList();

        Assert.Single(linhas);
        Assert.Equal(ws1, (Guid)tipo.GetProperty("WorkspaceId", BindingFlags.Public | BindingFlags.Instance)!.GetValue(linhas[0])!);
    }

    [Fact]
    public async Task Indice_unico_recusa_numero_de_pr_duplicado_no_mesmo_repositorio_e_workspace()
    {
        var (api, conexao) = await BancoMigradoAsync();
        await using var _ = api;
        var ws = Guid.NewGuid();
        var repo = Guid.NewGuid();
        var agora = DateTime.UtcNow;
        await ExecutarAsync(conexao, "INSERT INTO workspaces (id, nome, criado_em) VALUES (@p0, 'Um', @p1)", ws, agora);
        await ExecutarAsync(conexao,
            "INSERT INTO repositorios (id, workspace_id, nome, criado_em) VALUES (@p0, @p1, 'r', @p2)", repo, ws, agora);

        const string insere = "INSERT INTO pull_requests (id, workspace_id, repositorio_id, numero, titulo, autor, estado, criado_em) " +
                              "VALUES (@p0, @p1, @p2, 42, 'PR', 'ana', 'aberto', @p3)";
        await ExecutarAsync(conexao, insere, Guid.NewGuid(), ws, repo, agora);

        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            ExecutarAsync(conexao, insere, Guid.NewGuid(), ws, repo, agora));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, ex.SqlState);
    }
}
