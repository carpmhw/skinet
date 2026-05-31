using Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace API.Tests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(
        Path.GetTempPath(), $"skinet-test-{Guid.NewGuid()}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var apiProjectPath = Path.Combine(
            Directory.GetCurrentDirectory(), "..", "..", "..", "..", "API");

        builder.UseContentRoot(apiProjectPath);

        builder.ConfigureTestServices(services =>
        {
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<StoreContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            services.AddDbContext<StoreContext>(options =>
            {
                options.UseSqlite($"Data Source={_dbPath}");
            });

            var sp = services.BuildServiceProvider();
            using var scope = sp.CreateScope();
            var scopedServices = scope.ServiceProvider;
            var context = scopedServices.GetRequiredService<StoreContext>();
            context.Database.EnsureCreated();

            var seedPath = Path.GetFullPath(
                Path.Combine(apiProjectPath, "..", "Infrastructure", "Data", "SeedData"));
            StoreContextSeed.SeedAsync(context,
                scopedServices.GetRequiredService<ILoggerFactory>(), seedPath).Wait();
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && File.Exists(_dbPath))
        {
            try { File.Delete(_dbPath); } catch { }
        }
        base.Dispose(disposing);
    }
}
