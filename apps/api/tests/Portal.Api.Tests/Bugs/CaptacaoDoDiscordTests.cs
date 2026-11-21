using System.Net;
using System.Text.Json;
using System.Web;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Bugs;
using Portal.Api.Bugs.Discord;
using Portal.Api.Dados;

namespace Portal.Api.Tests.Bugs;

/// <summary>P-025: mensagens do canal viram bugs "a triar". Nenhum teste chama o Discord de verdade.</summary>
[Collection("postgres")]
public class CaptacaoDoDiscordTests
{
    private const string SegredoA = "bot.SEGREDO.workspace.a.0001.wxyz";
    private const string SegredoB = "bot.SEGREDO.workspace.b.0002.wxyz";

    private readonly PostgresFixture _pg;

    public CaptacaoDoDiscordTests(PostgresFixture pg) => _pg = pg;

    private static HttpResponseMessage Mensagens(params (string, string)[] cabecalhos) =>
        HandlerGravado.Json(HandlerGravado.Gravacao("discord-mensagens.json"), HttpStatusCode.OK, cabecalhos);

    private static string? After(HandlerGravado.Vista v) => HttpUtility.ParseQueryString(v.Uri.Query)["after"];

    [Fact]
    public async Task Mensagem_do_canal_vira_bug_a_triar_com_autor_e_relato_e_ignora_bot_vazio_e_sistema()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        var configurado = (await api.ConfigDiscordAsync(ws))!.ConfiguradoEm;
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();

        var bugs = await api.BugsAsync(ws);
        Assert.Equal(new[] { "1985510000000000001", "1985510000000000005" }, bugs.Select(b => b.MensagemExternaId).Order().ToArray());
        var pix = bugs.Single(b => b.MensagemExternaId == "1985510000000000001");
        Assert.Equal("Checkout trava ao pagar com Pix", pix.Titulo);
        Assert.Equal("Checkout trava ao pagar com Pix\nCliquei em pagar e a tela ficou branca. Esperava ver o QR code. Chrome 120 no Windows 11.", pix.Relato);
        Assert.Equal("Ana Souza", pix.Autor);
        Assert.Equal(OrigemBug.Discord, pix.Origem);
        Assert.Equal(StatusBug.ATriar, pix.Status);
        Assert.Equal("", pix.Passos);
        var resposta = bugs.Single(b => b.MensagemExternaId == "1985510000000000005");
        Assert.Equal("bia.dev", resposta.Autor);

        // Pedido certo: canal configurado, token do bot no cabeçalho, cursor = instante da configuração.
        var vista = Assert.Single(api.Discord.Vistas);
        Assert.Equal($"/api/v10/channels/{ApiBugsFalsa.Canal}/messages", vista.Uri.AbsolutePath);
        Assert.Equal("Bot " + SegredoA, vista.Cabecalhos["Authorization"]);
        Assert.Equal(Snowflake.De(configurado), After(vista));
        Assert.Equal("100", HttpUtility.ParseQueryString(vista.Uri.Query)["limit"]);
        Assert.Empty(api.Discord.Inesperadas);

        var config = await api.ConfigDiscordAsync(ws);
        Assert.Equal("1985510000000000005", config!.UltimaMensagemId);
        Assert.NotNull(config.UltimaLeitura);
        Assert.Null(config.UltimoErro);

        // Aparece na API de bugs do workspace como "a triar", com origem discord.
        using var lista = await dono.GetAsync("/api/bugs?status=a_triar");
        var json = JsonDocument.Parse(await lista.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, json.GetArrayLength());
        Assert.All(json.EnumerateArray(), b => Assert.Equal("discord", b.GetProperty("origem").GetString()));
        Assert.Contains(json.EnumerateArray(), b => b.GetProperty("autor").GetString() == "Ana Souza");
    }

    [Fact]
    public async Task A_mesma_mensagem_nunca_vira_dois_bugs()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();
        // 2º ciclo: o cursor avançou (after = última lida); mesmo que o Discord devolva as mesmas, nada duplica.
        await api.CicloDoDiscordAsync();
        Assert.Equal("1985510000000000005", After(api.Discord.Vistas[1]));

        // Cursor perdido (ex.: restauração): relê tudo e a checagem por id da mensagem segura.
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            await db.ConfiguracoesDiscord.IgnoreQueryFilters().Where(c => c.WorkspaceId == ws)
                .ExecuteUpdateAsync(s => s.SetProperty(c => c.UltimaMensagemId, (string?)null));
        }
        await api.CicloDoDiscordAsync();

        Assert.Equal(2, (await api.BugsAsync(ws)).Count);

        // E o índice único barra mesmo se alguém tentar inserir direto.
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            db.Bugs.Add(new Bug { WorkspaceId = ws, Titulo = "dup", Origem = OrigemBug.Discord, MensagemExternaId = "1985510000000000001" });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task Mesma_mensagem_em_workspaces_diferentes_vira_um_bug_em_cada()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (a, wsA) = await api.NovoWorkspaceAsync();
        var (b, wsB) = await api.NovoWorkspaceAsync();
        using var _a = a;
        using var _b = b;
        await api.ConfigurarDiscordAsync(a, SegredoA);
        await api.ConfigurarDiscordAsync(b, SegredoB);
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();

        Assert.Equal(2, (await api.BugsAsync(wsA)).Count);
        Assert.Equal(2, (await api.BugsAsync(wsB)).Count);
        Assert.Equal(2, JsonDocument.Parse(await (await a.GetAsync("/api/bugs")).Content.ReadAsStringAsync()).RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Rate_limit_429_respeita_o_retry_after_antes_de_chamar_de_novo()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        api.Discord.Depois((_, _) => HandlerGravado.Json(HandlerGravado.Gravacao("discord-429.json"), HttpStatusCode.TooManyRequests,
            ("Retry-After", "65"), ("X-RateLimit-Scope", "user")));
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();
        Assert.Single(api.Discord.Vistas);
        Assert.Empty(await api.BugsAsync(ws));
        Assert.Null((await api.ConfigDiscordAsync(ws))!.UltimoErro);

        api.Relogio.Avancar(TimeSpan.FromSeconds(60));
        await api.CicloDoDiscordAsync();
        Assert.Single(api.Discord.Vistas);

        api.Relogio.Avancar(TimeSpan.FromSeconds(6));
        await api.CicloDoDiscordAsync();
        Assert.Equal(2, api.Discord.Vistas.Count);
        Assert.Equal(2, (await api.BugsAsync(ws)).Count);
    }

    [Fact]
    public async Task Rate_limit_429_sem_cabecalho_usa_o_retry_after_do_corpo()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        api.Discord.Depois((_, _) => HandlerGravado.Json(HandlerGravado.Gravacao("discord-429.json"), HttpStatusCode.TooManyRequests));
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();
        api.Relogio.Avancar(TimeSpan.FromSeconds(64));
        await api.CicloDoDiscordAsync();
        Assert.Single(api.Discord.Vistas);

        api.Relogio.Avancar(TimeSpan.FromSeconds(1));
        await api.CicloDoDiscordAsync();
        Assert.Equal(2, api.Discord.Vistas.Count);
    }

    [Fact]
    public async Task Balde_zerado_para_a_paginacao_e_espera_o_reset_after()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        var cheia = PaginaCheia(1, 100);
        api.Discord.Depois((_, _) => HandlerGravado.Json(cheia, HttpStatusCode.OK,
            ("X-RateLimit-Remaining", "0"), ("X-RateLimit-Reset-After", "30.5")));
        api.Discord.Padrao = (_, _) => HandlerGravado.Json("[]");

        await api.CicloDoDiscordAsync();
        // Página cheia pediria a próxima, mas o balde zerou: para e guarda o que leu.
        Assert.Single(api.Discord.Vistas);
        Assert.Equal(100, (await api.BugsAsync(ws)).Count);

        api.Relogio.Avancar(TimeSpan.FromSeconds(30));
        await api.CicloDoDiscordAsync();
        Assert.Single(api.Discord.Vistas);

        api.Relogio.Avancar(TimeSpan.FromSeconds(1));
        await api.CicloDoDiscordAsync();
        Assert.Equal(2, api.Discord.Vistas.Count);
    }

    [Fact]
    public async Task Pagina_cheia_le_a_proxima_no_mesmo_ciclo_a_partir_da_ultima()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        api.Discord.Depois((_, _) => HandlerGravado.Json(PaginaCheia(1, 100)));
        api.Discord.Padrao = (_, _) => HandlerGravado.Json(PaginaCheia(101, 2));

        await api.CicloDoDiscordAsync();

        Assert.Equal(2, api.Discord.Vistas.Count);
        Assert.Equal(Id(100), After(api.Discord.Vistas[1]));
        Assert.Equal(102, (await api.BugsAsync(ws)).Count);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "discord-401.json", "Token do bot inválido ou sem acesso ao canal.")]
    [InlineData(HttpStatusCode.Forbidden, "discord-401.json", "Token do bot inválido ou sem acesso ao canal.")]
    [InlineData(HttpStatusCode.NotFound, "discord-404.json", "Canal do Discord não encontrado.")]
    [InlineData(HttpStatusCode.InternalServerError, "discord-401.json", "Não foi possível ler o canal do Discord.")]
    public async Task Erro_do_discord_fica_registrado_no_workspace_e_nao_atrapalha_os_outros(HttpStatusCode status, string gravacao, string erro)
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (a, wsA) = await api.NovoWorkspaceAsync();
        var (b, wsB) = await api.NovoWorkspaceAsync();
        using var _a = a;
        using var _b = b;
        await api.ConfigurarDiscordAsync(a, SegredoA);
        await api.ConfigurarDiscordAsync(b, SegredoB);
        api.Discord.Padrao = (req, _) => req.Headers.Authorization!.Parameter == SegredoA
            ? HandlerGravado.Json(HandlerGravado.Gravacao(gravacao), status)
            : Mensagens();

        await api.CicloDoDiscordAsync();

        var configA = await api.ConfigDiscordAsync(wsA);
        Assert.Equal(erro, configA!.UltimoErro);
        Assert.NotNull(configA.UltimaLeitura);
        Assert.Null(configA.UltimaMensagemId);
        Assert.Empty(await api.BugsAsync(wsA));
        Assert.Null((await api.ConfigDiscordAsync(wsB))!.UltimoErro);
        Assert.Equal(2, (await api.BugsAsync(wsB)).Count);

        // O erro aparece para o time no GET (sem o token) e a API segue de pé.
        var texto = await (await a.GetAsync("/api/integracoes/discord")).Content.ReadAsStringAsync();
        Assert.Contains(erro, JsonDocument.Parse(texto).RootElement.GetProperty("ultimoErro").GetString());
        Assert.DoesNotContain(SegredoA, texto);
        Assert.Equal(HttpStatusCode.OK, (await api.CreateClient().GetAsync("/health")).StatusCode);
    }

    [Fact]
    public async Task Excecao_de_rede_ou_resposta_ilegivel_vira_erro_registrado_sem_derrubar_e_sem_vazar_o_token()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        api.Discord.Depois((_, _) => throw new HttpRequestException("Connection refused"));
        api.Discord.Depois((_, _) => HandlerGravado.Json("<html>não é json</html>"));
        api.Discord.Padrao = (_, _) => Mensagens();

        await api.CicloDoDiscordAsync();
        Assert.Equal("Não foi possível ler o canal do Discord.", (await api.ConfigDiscordAsync(ws))!.UltimoErro);
        await api.CicloDoDiscordAsync();
        Assert.Equal("Não foi possível ler o canal do Discord.", (await api.ConfigDiscordAsync(ws))!.UltimoErro);

        // Volta ao normal no ciclo seguinte e limpa o erro.
        await api.CicloDoDiscordAsync();
        Assert.Null((await api.ConfigDiscordAsync(ws))!.UltimoErro);
        Assert.Equal(2, (await api.BugsAsync(ws)).Count);

        Assert.NotEmpty(api.Logs.Linhas);
        Assert.DoesNotContain(api.Logs.Linhas, l => l.Contains(SegredoA) || l.Contains("SEGREDO"));
    }

    [Fact]
    public async Task Sem_bot_configurado_nao_chama_o_discord()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;

        await api.CicloDoDiscordAsync();

        Assert.Empty(api.Discord.Vistas);
    }

    [Fact]
    public async Task Relato_longo_tem_titulo_cortado_e_relato_inteiro()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoA);
        var texto = "\n\n   " + new string('a', 300) + "\nsegunda linha";
        api.Discord.Padrao = (_, _) => HandlerGravado.Json(JsonSerializer.Serialize(new[]
        {
            new { id = Id(1), type = 0, content = texto, author = new { username = "ana", global_name = (string?)null } },
        }));

        await api.CicloDoDiscordAsync();

        var bug = Assert.Single(await api.BugsAsync(ws));
        Assert.Equal(ImportadorDoDiscord.TituloMaximo, bug.Titulo.Length);
        Assert.EndsWith("…", bug.Titulo);
        Assert.Equal(texto.Trim(), bug.Relato);
    }

    private static string Id(int n) => (1985510000000000000UL + (ulong)n).ToString();

    private static string PaginaCheia(int de, int quantas) => JsonSerializer.Serialize(
        Enumerable.Range(de, quantas).Reverse().Select(n => new
        {
            id = Id(n), type = 0, content = $"Bug número {n}", author = new { username = "ana", global_name = "Ana" },
        }));
}
