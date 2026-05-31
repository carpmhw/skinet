FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY skinet.sln .
COPY API/API.csproj API/
COPY Core/Core.csproj Core/
COPY Infrastructure/Infrastructure.csproj Infrastructure/
RUN dotnet restore API/API.csproj
COPY . .
RUN dotnet publish API/API.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
EXPOSE 80
EXPOSE 443
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:80
ENV ASPNETCORE_ENVIRONMENT=Development
ENTRYPOINT ["dotnet", "API.dll"]
