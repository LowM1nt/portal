using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Portal.Api.Bugs.Discord;
using Portal.Api.Bugs.Extracao;
using Portal.Api.Dados;
using Portal.Api.Workspaces;

namespace Portal.Api.Tests.Bugs;

/// <summary>Configuração do bot do Discord e da chave de IA por workspace (D-014): só dono, segredo cifrado, nunca volta.</summary>
[Collection("postgres")]
public class IntegracoesDeBugsConfigTests
{
    private const string RotaDiscord = "/api/integracoes/discord";
    private const string RotaIa = "/api/integracoes/ia";
    private const string SegredoBot = "bot.SEGREDO.discord.unico.0123456789.wxyz";
    private const string SegredoIa = "ia.SEGREDO.gemini.unico.0123456789.k9z8";

    private readonly PostgresFixture _pg;

    public IntegracoesDeBugsConfigTests(PostgresFixture pg) => _pg = pg;

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    // ---------- Discord ----------

    [Fact]
    public async Task Discord_put_grava_token_cifrado_e_nem_put_nem_get_devolvem_o_token()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;

        using var put = await dono.PutAsJsonAsync(RotaDiscord, new { token = SegredoBot, canalId = ApiBugsFalsa.Canal });
        using var get = await dono.GetAsync(RotaDiscord);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        foreach (var texto in new[] { await put.Content.ReadAsStringAsync(), await get.Content.ReadAsStringAsync() })
        {
            Assert.DoesNotContain(SegredoBot, texto);
            Assert.DoesNotContain("SEGREDO", texto);
            var json = JsonDocument.Parse(texto).RootElement;
            Assert.True(json.GetProperty("configurado").GetBoolean());
            Assert.Equal("wxyz", json.GetProperty("finalToken").GetString());
            Assert.Equal(ApiBugsFalsa.Canal, json.GetProperty("canalId").GetString());
            Assert.Equal(JsonValueKind.Null, json.GetProperty("ultimoErro").ValueKind);
        }

        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var linha = await db.ConfiguracoesDiscord.IgnoreQueryFilters().SingleAsync(c => c.WorkspaceId == ws);
        Assert.DoesNotContain(SegredoBot, linha.TokenCriptografado);
        Assert.DoesNotContain("SEGREDO", linha.TokenCriptografado);
        var protetor = escopo.ServiceProvider.GetRequiredService<IDataProtectionProvider>().CreateProtector(DiscordConfigService.Proposito);
        Assert.Equal(SegredoBot, protetor.Unprotect(linha.TokenCriptografado));
        // Propósito próprio: o protetor do GitHub não abre o token do Discord.
        var doGitHub = escopo.ServiceProvider.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector(Portal.Api.Integracoes.GitHub.GitHubConfigService.Proposito);
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => doGitHub.Unprotect(linha.TokenCriptografado));

        Assert.NotEmpty(api.Logs.Linhas);
        Assert.DoesNotContain(api.Logs.Linhas, l => l.Contains(SegredoBot) || l.Contains("SEGREDO"));
    }

    [Theory]
    [InlineData(null, "123456789012345678")]
    [InlineData("   ", "123456789012345678")]
    [InlineData("um.token.valido.qualquer", "")]
    [InlineData("um.token.valido.qualquer", "abc")]
    [InlineData("um.token.valido.qualquer", "1234")]
    [InlineData("um.token.valido.qualquer", "../../users/@me")]
    public async Task Discord_put_invalido_devolve_400_e_nao_grava(string? token, string canal)
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;

        using var r = await dono.PutAsJsonAsync(RotaDiscord, new { token, canalId = canal });

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.False((await Json(await dono.GetAsync(RotaDiscord))).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Discord_trocar_o_canal_sem_token_mantem_o_token_e_reinicia_o_cursor()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoBot);
        using (var escopo = api.Services.CreateScope())
        {
            var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
            var c = await db.ConfiguracoesDiscord.IgnoreQueryFilters().SingleAsync(x => x.WorkspaceId == ws);
            c.UltimaMensagemId = "1985510000000000009";
            await db.SaveChangesAsync();
        }

        using var r = await dono.PutAsJsonAsync(RotaDiscord, new { canalId = "999999999999999999" });

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var config = await api.ConfigDiscordAsync(ws);
        Assert.Equal("999999999999999999", config!.CanalId);
        Assert.Null(config.UltimaMensagemId);
        Assert.Equal("wxyz", config.FinalToken);
    }

    [Fact]
    public async Task Discord_delete_apaga_e_o_get_mostra_configurado_false()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoBot);

        using var del = await dono.DeleteAsync(RotaDiscord);

        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        Assert.False((await Json(await dono.GetAsync(RotaDiscord))).GetProperty("configurado").GetBoolean());
    }

    // ---------- IA ----------

    [Fact]
    public async Task Ia_put_grava_chave_cifrada_e_o_get_informa_so_se_ha_chave_e_o_provedor()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;

        using (var antes = await dono.GetAsync(RotaIa))
        {
            var json = await Json(antes);
            Assert.False(json.GetProperty("configurado").GetBoolean());
            Assert.Equal(JsonValueKind.Null, json.GetProperty("provedor").ValueKind);
        }

        using var put = await dono.PutAsJsonAsync(RotaIa, new { provedor = "gemini", chave = SegredoIa });
        using var get = await dono.GetAsync(RotaIa);

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        foreach (var texto in new[] { await put.Content.ReadAsStringAsync(), await get.Content.ReadAsStringAsync() })
        {
            Assert.DoesNotContain(SegredoIa, texto);
            Assert.DoesNotContain("k9z8", texto);
            var json = JsonDocument.Parse(texto).RootElement;
            Assert.Equal(new[] { "configurado", "provedor" }, json.EnumerateObject().Select(p => p.Name).ToArray());
            Assert.True(json.GetProperty("configurado").GetBoolean());
            Assert.Equal("gemini", json.GetProperty("provedor").GetString());
        }

        using var escopo = api.Services.CreateScope();
        var db = escopo.ServiceProvider.GetRequiredService<PortalDbContext>();
        var linha = await db.ConfiguracoesIa.IgnoreQueryFilters().SingleAsync(c => c.WorkspaceId == ws);
        Assert.DoesNotContain(SegredoIa, linha.ChaveCriptografada);
        Assert.Equal(SegredoIa, escopo.ServiceProvider.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector(IaConfigService.Proposito).Unprotect(linha.ChaveCriptografada));

        Assert.DoesNotContain(api.Logs.Linhas, l => l.Contains(SegredoIa) || l.Contains("SEGREDO"));
    }

    [Theory]
    [InlineData("openai", "uma.chave.qualquer")]
    [InlineData("gemini", "")]
    [InlineData("gemini", null)]
    public async Task Ia_put_invalido_devolve_400(string provedor, string? chave)
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;

        using var r = await dono.PutAsJsonAsync(RotaIa, new { provedor, chave });

        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.False((await Json(await dono.GetAsync(RotaIa))).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Ia_delete_apaga_a_chave()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarIaAsync(dono, SegredoIa);

        using var del = await dono.DeleteAsync(RotaIa);

        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        Assert.False((await Json(await dono.GetAsync(RotaIa))).GetProperty("configurado").GetBoolean());
    }

    // ---------- comuns ----------

    [Theory]
    [InlineData(Papeis.Membro)]
    [InlineData(Papeis.Admin)]
    public async Task So_o_dono_configura_quem_nao_e_dono_recebe_403_e_nada_muda(string papel)
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.ConfigurarDiscordAsync(dono, SegredoBot);
        await api.ConfigurarIaAsync(dono, SegredoIa);
        using var outro = await api.NovoMembroAsync(ws, papel);

        Assert.Equal(HttpStatusCode.Forbidden, (await outro.PutAsJsonAsync(RotaDiscord, new { token = "outro.token.x", canalId = "999999999999999999" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outro.DeleteAsync(RotaDiscord)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outro.PutAsJsonAsync(RotaIa, new { provedor = "gemini", chave = "outra.chave.x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await outro.DeleteAsync(RotaIa)).StatusCode);

        // Ler o estado (sem segredo) qualquer membro pode, como no GitHub.
        Assert.Equal(HttpStatusCode.OK, (await outro.GetAsync(RotaDiscord)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await outro.GetAsync(RotaIa)).StatusCode);
        var config = await api.ConfigDiscordAsync(ws);
        Assert.Equal(ApiBugsFalsa.Canal, config!.CanalId);
        Assert.True((await Json(await dono.GetAsync(RotaIa))).GetProperty("configurado").GetBoolean());
    }

    [Fact]
    public async Task Outro_workspace_nao_ve_nem_altera_e_quem_nao_e_membro_recebe_404()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (ana, wsAna) = await api.NovoWorkspaceAsync();
        var (beto, _) = await api.NovoWorkspaceAsync();
        using var _a = ana;
        using var _b = beto;
        await api.ConfigurarDiscordAsync(ana, SegredoBot);
        await api.ConfigurarIaAsync(ana, SegredoIa);

        Assert.False((await Json(await beto.GetAsync(RotaDiscord))).GetProperty("configurado").GetBoolean());
        Assert.False((await Json(await beto.GetAsync(RotaIa))).GetProperty("configurado").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await beto.DeleteAsync(RotaDiscord)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await beto.DeleteAsync(RotaIa)).StatusCode);

        using var intruso = api.ClienteCom(Guid.NewGuid(), workspace: wsAna);
        foreach (var rota in new[] { RotaDiscord, RotaIa })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await intruso.GetAsync(rota)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await intruso.DeleteAsync(rota)).StatusCode);
        }

        Assert.True((await Json(await ana.GetAsync(RotaDiscord))).GetProperty("configurado").GetBoolean());
        Assert.True((await Json(await ana.GetAsync(RotaIa))).GetProperty("configurado").GetBoolean());
    }
}
