using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;

namespace Portal.Api.Seguranca;

/// <summary>
/// Proteções HTTP da API: IP real atrás do proxy do Render, limite de requisições e limite de corpo.
/// Os limites vêm de RateLimit:AnonimoPorMinuto e RateLimit:AutenticadoPorMinuto (padrões 60 e 300).
/// </summary>
public static class SegurancaExtensions
{
    public const int CorpoMaximoBytes = 64 * 1024;

    public static IServiceCollection AddSegurancaHttp(this IServiceCollection services)
    {
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            // Só o último salto (o proxy do Render) é confiável: um X-Forwarded-For forjado pelo cliente não vale.
            o.ForwardLimit = 1;
            o.KnownNetworks.Clear();
            o.KnownProxies.Clear();
        });

        services.AddRateLimiter(_ => { });
        services.AddOptions<RateLimiterOptions>().Configure<IConfiguration>((o, config) =>
        {
            var anonimo = config.GetValue("RateLimit:AnonimoPorMinuto", 60);
            var autenticado = config.GetValue("RateLimit:AutenticadoPorMinuto", 300);
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.Headers.RetryAfter = "60";
                await ctx.HttpContext.Response.WriteAsJsonAsync(
                    new { erro = "Calma! Muitas requisições em pouco tempo. Tente de novo em um minuto." }, ct);
            };
            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
            {
                if (http.Request.Path.StartsWithSegments("/health"))
                    return RateLimitPartition.GetNoLimiter("health");

                var sub = http.User.FindFirstValue("sub");
                if (http.User.Identity?.IsAuthenticated == true && Guid.TryParse(sub, out _))
                    return RateLimitPartition.GetFixedWindowLimiter("u:" + sub, _ => Janela(autenticado));

                var ip = http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido";
                return RateLimitPartition.GetFixedWindowLimiter("ip:" + ip, _ => Janela(anonimo));
            });
        });

        return services;
    }

    private static FixedWindowRateLimiterOptions Janela(int porMinuto) => new()
    {
        PermitLimit = porMinuto,
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
        AutoReplenishment = true,
    };
}
