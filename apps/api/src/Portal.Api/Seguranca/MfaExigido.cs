using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Portal.Api.Dados;

namespace Portal.Api.Seguranca;

/// <summary>
/// Verificação em duas etapas exigida pela API (D-013). Quem ligou (<c>perfis_usuario.mfa_exigido</c>) só usa as rotas
/// autenticadas com um JWT <c>aal = aal2</c> (senha + código); com <c>aal1</c> (só senha) recebe 403
/// <c>{ erro, codigo: "mfa_necessario" }</c>. Exceção: rotas marcadas com <see cref="PermitirSemMfa{TBuilder}"/>
/// (só o <c>GET /api/me</c>, que o web usa para saber o estado).
/// </summary>
public static class MfaExigido
{
    public const string Codigo = "mfa_necessario";
    public const string Mensagem = "Confirme o código de duas etapas pra continuar.";

    /// <summary>O JWT do Supabase diz que o segundo fator foi verificado nesta sessão. Sem a claim = aal1.</summary>
    public static bool TokenAal2(ClaimsPrincipal usuario) => usuario.FindFirstValue("aal") == "aal2";

    public static IResult Necessario() =>
        Results.Json(new { erro = Mensagem, codigo = Codigo }, statusCode: StatusCodes.Status403Forbidden);

    /// <summary>Libera a rota do filtro de duas etapas. Use só quando for indispensável (hoje: <c>GET /api/me</c>).</summary>
    public static TBuilder PermitirSemMfa<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(new SemMfa());

    public static IServiceCollection AddMfaExigido(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddSingleton<CacheMfa>();
        return services;
    }

    /// <summary>Depois de <c>UseAuthorization</c>: vale para toda rota que exige login (presente e futura).</summary>
    public static IApplicationBuilder UseMfaExigido(this IApplicationBuilder app) => app.Use(async (http, next) =>
    {
        var endpoint = http.GetEndpoint();
        var exigeLogin = endpoint?.Metadata.GetMetadata<IAuthorizeData>() is not null;
        if (!exigeLogin
            || endpoint!.Metadata.GetMetadata<SemMfa>() is not null
            || http.User.Identity?.IsAuthenticated != true
            || TokenAal2(http.User)
            || !Guid.TryParse(http.User.FindFirstValue("sub"), out var usuario))
        {
            await next(http);
            return;
        }

        var cache = http.RequestServices.GetRequiredService<CacheMfa>();
        if (await cache.ExigidoAsync(usuario, http.RequestServices, http.RequestAborted))
        {
            await Necessario().ExecuteAsync(http);
            return;
        }

        await next(http);
    });

    private sealed class SemMfa;
}

/// <summary>
/// Cache curto (por instância) de <c>mfa_exigido</c>, para o filtro não ir ao banco a cada requisição aal1.
/// Token aal2 nem consulta. Quem muda o próprio estado nesta instância atualiza o cache na hora (<see cref="Definir"/>);
/// em outra instância (ou mudando direto no banco) a mudança leva até <see cref="Janela"/> para valer.
/// </summary>
public class CacheMfa
{
    public static readonly TimeSpan Janela = TimeSpan.FromSeconds(60);

    private readonly IMemoryCache _cache;

    public CacheMfa(IMemoryCache cache) => _cache = cache;

    private static string Chave(Guid usuario) => "mfa:" + usuario;

    public async Task<bool> ExigidoAsync(Guid usuario, IServiceProvider servicos, CancellationToken ct)
    {
        if (_cache.TryGetValue(Chave(usuario), out bool exigido)) return exigido;
        var db = servicos.GetRequiredService<PortalDbContext>();
        exigido = await db.PerfisUsuario.AsNoTracking()
            .Where(p => p.UsuarioId == usuario)
            .Select(p => p.MfaExigido)
            .FirstOrDefaultAsync(ct);
        _cache.Set(Chave(usuario), exigido, Janela);
        return exigido;
    }

    public void Definir(Guid usuario, bool exigido) => _cache.Set(Chave(usuario), exigido, Janela);
}
