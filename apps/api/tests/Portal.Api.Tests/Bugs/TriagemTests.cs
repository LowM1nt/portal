using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Portal.Api.Bugs;
using Portal.Api.Bugs.Extracao;

namespace Portal.Api.Tests.Bugs;

/// <summary>Base da triagem com IA (lote D): fila "a triar" com sugestão, possível duplicado e as ações.</summary>
[Collection("postgres")]
public class TriagemTests
{
    private const string Rota = "/api/triagem";
    private const string RelatoPix = "Cliquei em pagar com Pix e a tela ficou branca. Esperava ver o QR code. Chrome 120 no Windows 11.";

    private readonly PostgresFixture _pg;

    public TriagemTests(PostgresFixture pg) => _pg = pg;

    private static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task<JsonElement> Listar(HttpClient c)
    {
        using var r = await c.GetAsync(Rota);
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await Json(r);
    }

    private static Task<HttpResponseMessage> Agir(HttpClient c, Guid bug, string acao, string? severidade = null) =>
        c.PostAsJsonAsync($"{Rota}/{bug}", new { acao, severidade });

    /// <summary>Workspace com chave de IA e um bug já com sugestão pronta (severidade crítica, confiança 85).</summary>
    private static async Task<(HttpClient Dono, Guid Workspace, Guid Bug)> ComSugestaoProntaAsync(ApiBugsFalsa api)
    {
        var (dono, ws) = await api.NovoWorkspaceAsync();
        await api.ConfigurarIaAsync(dono, "chave.de.teste.qualquer");
        api.Gemini.Padrao = (_, _) => HandlerGravado.Json(HandlerGravado.Gravacao("gemini-extracao.json"));
        var bug = await api.CriarBugAsync(dono, "Checkout trava ao pagar com Pix", RelatoPix);
        await api.ProcessarIaAsync();
        return (dono, ws, bug);
    }

    [Fact]
    public async Task Lista_os_bugs_a_triar_com_a_sugestao_e_o_possivel_duplicado()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws, pix) = await ComSugestaoProntaAsync(api);
        using var _d = dono;
        var repetido = await api.CriarBugAsync(dono, "Checkout trava ao pagar com Pix no celular", "A tela ficou branca ao pagar com Pix.");
        var outro = await api.CriarBugAsync(dono, "Logo desalinhada no rodapé", "No rodapé do site a logo aparece torta.");
        var triado = await api.CriarBugAsync(dono, "Já triado", "x");
        (await dono.PatchAsJsonAsync($"/api/bugs/{triado}/status", new { status = "aberto" })).Dispose();

        var itens = (await Listar(dono)).EnumerateArray().ToDictionary(i => i.GetProperty("bugId").GetGuid());

        Assert.Equal(new[] { pix, repetido, outro }.Order(), itens.Keys.Order());

        var p = itens[pix];
        Assert.Equal("Checkout trava ao pagar com Pix", p.GetProperty("titulo").GetString());
        Assert.Equal(RelatoPix, p.GetProperty("relato").GetString());
        Assert.Equal("manual", p.GetProperty("origem").GetString());
        Assert.Equal("media", p.GetProperty("severidade").GetString());
        var s = p.GetProperty("sugestao");
        Assert.Equal("pronta", s.GetProperty("status").GetString());
        Assert.Equal("critica", s.GetProperty("severidade").GetString());
        Assert.Equal("Checkout", s.GetProperty("area").GetString());
        Assert.Equal(85, s.GetProperty("confianca").GetInt32());
        Assert.Equal(2, s.GetProperty("evidencias").GetArrayLength());
        Assert.Equal("Chrome 120, Windows 11", s.GetProperty("ambiente").GetString());

        // O parecido aponta para o original; o diferente não aponta para ninguém.
        var dup = itens[repetido].GetProperty("possivelDuplicado");
        Assert.Equal(pix, dup.GetProperty("bugId").GetGuid());
        Assert.Equal("Checkout trava ao pagar com Pix", dup.GetProperty("titulo").GetString());
        Assert.InRange(dup.GetProperty("similaridade").GetInt32(), 50, 100);
        Assert.Equal(JsonValueKind.Null, itens[outro].GetProperty("possivelDuplicado").ValueKind);
        // Bug criado depois da chave entra na fila: a sugestão aparece como pendente até a IA responder.
        Assert.Equal("pendente", itens[outro].GetProperty("sugestao").GetProperty("status").GetString());
        Assert.Single(await api.SugestoesAsync(ws), x => x.Status == StatusSugestao.Pronta);
    }

    [Fact]
    public async Task Sem_chave_lista_sem_sugestao()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, _) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        await api.CriarBugAsync(dono, "Bug sem IA", "relato");

        var item = Assert.Single((await Listar(dono)).EnumerateArray());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("sugestao").ValueKind);
    }

    [Fact]
    public async Task Aprovar_aplica_a_severidade_sugerida_e_move_para_em_andamento()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws, bug) = await ComSugestaoProntaAsync(api);
        using var _d = dono;

        using var r = await Agir(dono, bug, "aprovar");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var json = await Json(r);
        Assert.Equal("critica", json.GetProperty("bug").GetProperty("severidade").GetString());
        Assert.Equal("em_andamento", json.GetProperty("bug").GetProperty("status").GetString());
        Assert.Equal("aprovada", json.GetProperty("sugestao").GetProperty("status").GetString());
        var salvo = Assert.Single(await api.BugsAsync(ws));
        Assert.Equal(SeveridadeBug.Critica, salvo.Severidade);
        Assert.Equal(StatusBug.EmAndamento, salvo.Status);
        Assert.Equal(StatusSugestao.Aprovada, Assert.Single(await api.SugestoesAsync(ws)).Status);
        Assert.Equal(0, (await Listar(dono)).GetArrayLength());

        // Já triado: não aprova de novo.
        using var deNovo = await Agir(dono, bug, "aprovar");
        Assert.Equal(HttpStatusCode.Conflict, deNovo.StatusCode);
    }

    [Fact]
    public async Task Ajustar_usa_a_severidade_escolhida_e_move_para_em_andamento()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws, bug) = await ComSugestaoProntaAsync(api);
        using var _d = dono;

        using (var invalido = await Agir(dono, bug, "ajustar", "urgente"))
            Assert.Equal(HttpStatusCode.BadRequest, invalido.StatusCode);
        using var r = await Agir(dono, bug, "ajustar", "baixa");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var salvo = Assert.Single(await api.BugsAsync(ws));
        Assert.Equal(SeveridadeBug.Baixa, salvo.Severidade);
        Assert.Equal(StatusBug.EmAndamento, salvo.Status);
        var s = Assert.Single(await api.SugestoesAsync(ws));
        Assert.Equal(StatusSugestao.Ajustada, s.Status);
        Assert.Equal("critica", s.Severidade); // o que a IA sugeriu continua registrado à parte
    }

    [Fact]
    public async Task Ajustar_funciona_mesmo_sem_sugestao_da_ia()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        var bug = await api.CriarBugAsync(dono, "Sem IA", "relato");

        using var r = await Agir(dono, bug, "ajustar", "alta");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Json(r)).GetProperty("sugestao").ValueKind);
        Assert.Equal(SeveridadeBug.Alta, Assert.Single(await api.BugsAsync(ws)).Severidade);
    }

    [Fact]
    public async Task Descartar_marca_a_sugestao_e_o_bug_continua_a_triar()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws, bug) = await ComSugestaoProntaAsync(api);
        using var _d = dono;

        using var r = await Agir(dono, bug, "descartar");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var salvo = Assert.Single(await api.BugsAsync(ws));
        Assert.Equal(StatusBug.ATriar, salvo.Status);
        Assert.Equal(SeveridadeBug.Media, salvo.Severidade);
        Assert.Equal(StatusSugestao.Descartada, Assert.Single(await api.SugestoesAsync(ws)).Status);
        var item = Assert.Single((await Listar(dono)).EnumerateArray());
        Assert.Equal("descartada", item.GetProperty("sugestao").GetProperty("status").GetString());

        // Sugestão descartada não pode mais ser aprovada; ajustar à mão continua possível.
        using (var aprovar = await Agir(dono, bug, "aprovar"))
            Assert.Equal(HttpStatusCode.Conflict, aprovar.StatusCode);
        using (var ajustar = await Agir(dono, bug, "ajustar", "alta"))
            Assert.Equal(HttpStatusCode.OK, ajustar.StatusCode);
    }

    [Fact]
    public async Task Acao_invalida_400_e_sem_sugestao_pronta_409()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws) = await api.NovoWorkspaceAsync();
        using var _d = dono;
        var bug = await api.CriarBugAsync(dono, "Sem IA", "relato");

        using (var r = await Agir(dono, bug, "apagar")) Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        using (var r = await Agir(dono, bug, "aprovar")) Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
        using (var r = await Agir(dono, bug, "descartar")) Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
        using (var r = await Agir(dono, Guid.NewGuid(), "aprovar")) Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);

        var salvo = Assert.Single(await api.BugsAsync(ws));
        Assert.Equal(StatusBug.ATriar, salvo.Status);
    }

    [Fact]
    public async Task Qualquer_membro_do_workspace_tria()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (dono, ws, bug) = await ComSugestaoProntaAsync(api);
        using var _d = dono;
        using var membro = await api.NovoMembroAsync(ws);

        Assert.Equal(1, (await Listar(membro)).GetArrayLength());
        using var r = await Agir(membro, bug, "aprovar");

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
    }

    [Fact]
    public async Task Outro_workspace_nao_ve_nem_tria_os_bugs_do_primeiro()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        var (ana, wsAna, bug) = await ComSugestaoProntaAsync(api);
        var (beto, _) = await api.NovoWorkspaceAsync();
        using var _a = ana;
        using var _b = beto;
        var doBeto = await api.CriarBugAsync(beto, "Checkout trava ao pagar com Pix", RelatoPix);

        // Beto só vê o dele, e o duplicado não cruza workspaces.
        var itemBeto = Assert.Single((await Listar(beto)).EnumerateArray());
        Assert.Equal(doBeto, itemBeto.GetProperty("bugId").GetGuid());
        Assert.Equal(JsonValueKind.Null, itemBeto.GetProperty("possivelDuplicado").ValueKind);
        Assert.Equal(JsonValueKind.Null, itemBeto.GetProperty("sugestao").ValueKind);

        // Beto, no workspace dele, tentando agir no bug da Ana: 404 nas três ações.
        foreach (var acao in new[] { "aprovar", "ajustar", "descartar" })
            using (var r = await Agir(beto, bug, acao, "baixa"))
                Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);

        // Quem não é membro, apontando para o workspace da Ana: 404.
        using var intruso = api.ClienteCom(Guid.NewGuid(), workspace: wsAna);
        using (var r = await intruso.GetAsync(Rota)) Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        using (var r = await Agir(intruso, bug, "aprovar")) Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);

        var salvo = Assert.Single(await api.BugsAsync(wsAna));
        Assert.Equal(StatusBug.ATriar, salvo.Status);
        Assert.Equal(SeveridadeBug.Media, salvo.Severidade);
        Assert.Equal(StatusSugestao.Pronta, Assert.Single(await api.SugestoesAsync(wsAna)).Status);
    }

    [Fact]
    public async Task Sem_login_401()
    {
        await using var api = await ApiBugsFalsa.CriarAsync(_pg);
        using var anonimo = api.CreateClient();
        anonimo.DefaultRequestHeaders.Add("X-Workspace-Id", Guid.NewGuid().ToString());

        using var get = await anonimo.GetAsync(Rota);
        using var post = await Agir(anonimo, Guid.NewGuid(), "aprovar");

        Assert.Equal(HttpStatusCode.Unauthorized, get.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, post.StatusCode);
    }
}
