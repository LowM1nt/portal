# Imagem da API do portal. Contexto de build: apps/api
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY global.json ./
COPY src/Portal.Api/Portal.Api.csproj src/Portal.Api/
RUN dotnet restore src/Portal.Api/Portal.Api.csproj
COPY src/ src/
RUN dotnet publish src/Portal.Api/Portal.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Portal.Api.dll"]
