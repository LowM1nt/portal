namespace Portal.Api.Workspaces;

/// <summary>Envio de e-mail transacional. Ainda não há provedor: a implementação registrada não faz nada.</summary>
public interface IEnviadorDeEmail
{
    Task EnviarConviteAsync(string para, string nomeDoWorkspace, string link, CancellationToken ct);
}

/// <summary>Não envia nada (sem provedor configurado). O dono copia o link devolvido pela API.</summary>
public sealed class EnviadorDeEmailNulo : IEnviadorDeEmail
{
    public Task EnviarConviteAsync(string para, string nomeDoWorkspace, string link, CancellationToken ct) => Task.CompletedTask;
}
