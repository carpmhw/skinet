# Build 1: Angular production build
FROM node:24-alpine AS client-build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build -- --configuration production

# Build 2: ASP.NET Core publish
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY skinet.sln ./
COPY API/API.csproj API/
COPY Core/Core.csproj Core/
COPY Infrastructure/Infrastructure.csproj Infrastructure/
RUN dotnet restore API/API.csproj
COPY API/ API/
COPY Core/ Core/
COPY Infrastructure/ Infrastructure/
RUN dotnet publish API/API.csproj -c Release -o /out --no-restore

# Runtime: single ASP.NET Core host with Angular and API under one origin
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=api-build /out/ ./
COPY --from=client-build /src/client/dist/client/ ./wwwroot/
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "API.dll"]
