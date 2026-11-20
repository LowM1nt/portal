using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Portal.Api.Auth;

public static class AuthExtensions
{
    /// <summary>
    /// Valida o JWT do Supabase (JWKS do projeto, aud = authenticated). A API só valida: não guarda senha nem emite token.
    /// Só no ambiente Testing, se Jwt:ChaveTeste existir, usa essa chave simétrica (testes). A configuração é lida
    /// de forma tardia para enxergar o que a fábrica de testes define.
    /// </summary>
    public static IServiceCollection AddAutenticacaoSupabase(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped(sp => UsuarioAtual.De(sp.GetRequiredService<IHttpContextAccessor>().HttpContext?.User));

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddAuthorization();

        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IConfiguration, IHostEnvironment>((o, config, env) =>
            {
                o.MapInboundClaims = false;
                o.RequireHttpsMetadata = !env.IsDevelopment() && !env.IsEnvironment("Testing");
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateAudience = true,
                    ValidAudience = "authenticated",
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ValidateIssuerSigningKey = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };

                var chaveTeste = config["Jwt:ChaveTeste"];
                var url = config["Supabase:Url"]?.TrimEnd('/');
                if (env.IsEnvironment("Testing") && !string.IsNullOrEmpty(chaveTeste))
                {
                    o.TokenValidationParameters.ValidateIssuer = false;
                    o.TokenValidationParameters.IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(chaveTeste));
                }
                else if (!string.IsNullOrEmpty(url))
                {
                    var emissor = $"{url}/auth/v1";
                    o.MetadataAddress = $"{emissor}/.well-known/openid-configuration";
                    o.TokenValidationParameters.ValidateIssuer = true;
                    o.TokenValidationParameters.ValidIssuer = emissor;
                }
                else
                {
                    // Sem Supabase:Url configurado nenhum token é aceito (tudo 401), nunca o contrário.
                    o.TokenValidationParameters.ValidateIssuer = false;
                    o.TokenValidationParameters.SignatureValidator = (_, _) =>
                        throw new SecurityTokenInvalidSignatureException("Supabase:Url não configurado.");
                }

                o.Events = new JwtBearerEvents
                {
                    OnTokenValidated = ctx =>
                    {
                        if (!Guid.TryParse(ctx.Principal?.FindFirstValue("sub"), out _))
                            ctx.Fail("O token não tem um sub válido.");
                        return Task.CompletedTask;
                    },
                };
            });

        return services;
    }
}
