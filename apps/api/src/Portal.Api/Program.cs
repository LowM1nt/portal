var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();

// Exposto para os testes de integração (WebApplicationFactory<Program>).
public partial class Program
{
}
