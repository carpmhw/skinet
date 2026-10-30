using API.Errors;
using API.Extensions;
using API.Helper;
using API.Middleware;
using Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAutoMapper(_ => { }, typeof(MapperProfiles));
builder.Services.AddControllers();
builder.Services.AddDbContext<StoreContext>(x =>
    x.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddApplicationServices();
builder.Services.AddSwaggerDocumentation();
builder.Services.AddCors(opt =>
    opt.AddPolicy("CorsPolicy", policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod().WithOrigins("https://localhost:4200");
    })
);

var app = builder.Build();

app.UseMiddleware<ExceptionMiddleware>();
app.UseStatusCodePagesWithReExecute("/errors/{0}");

// 容器內只提供 HTTP，TLS 由 Cloudflare Tunnel 終止；Production 不做 HTTPS 重導。
if (!app.Environment.IsProduction())
{
    app.UseHttpsRedirection();
}

app.UseRouting();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors("CorsPolicy");
app.UseAuthorization();

// Swagger 僅在開發環境提供，正式環境不公開。
if (app.Environment.IsDevelopment())
{
    app.UseSwaggerDocumentation();
}

app.MapControllers();

// 未知 API 與 Swagger 路徑必須維持 404，不可被 SPA fallback 轉成首頁。
var notFoundMethods = new[] { "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS" };
var apiNotFound = () => Results.NotFound(new ApiResponse(404));

app.MapMethods("/api/{**path}", notFoundMethods, apiNotFound);
app.MapMethods("/swagger", notFoundMethods, apiNotFound);
app.MapMethods("/swagger/{**path}", notFoundMethods, apiNotFound);

// Angular 客戶端路由重新整理時回到首頁。
app.MapFallbackToFile("index.html");

using var scope = app.Services.CreateScope();
var services = scope.ServiceProvider;
var loggerFactory = services.GetRequiredService<ILoggerFactory>();
try
{
    var context = services.GetRequiredService<StoreContext>();
    await context.Database.MigrateAsync();
    await StoreContextSeed.SeedAsync(context, loggerFactory);
}
catch (Exception ex)
{
    var logger = loggerFactory.CreateLogger<Program>();
    logger.LogError(ex, "Migrate Error");
}

app.Run();
