using Infrastructure.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace API.Tests;

/// <summary>
/// 建立以暫存 SQLite 與暫存靜態檔案根目錄運作的測試主機。
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(
        Path.GetTempPath(), $"skinet-test-{Guid.NewGuid()}.db");

    private readonly string _webRootPath = Path.Combine(
        Path.GetTempPath(), $"skinet-webroot-{Guid.NewGuid()}");

    /// <summary>
    /// 測試用的靜態檔案根目錄。
    /// </summary>
    public string WebRootPath => _webRootPath;

    /// <summary>
    /// 設定測試資料庫、內容根目錄與靜態檔案根目錄。
    /// </summary>
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var apiProjectPath = Path.Combine(
            Directory.GetCurrentDirectory(), "..", "..", "..", "..", "API");

        PrepareWebRoot(apiProjectPath);

        builder.UseContentRoot(apiProjectPath);
        builder.UseWebRoot(_webRootPath);

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

    /// <summary>
    /// 建立測試靜態檔案根目錄，包含首頁、測試資產與商品圖片。
    /// </summary>
    private void PrepareWebRoot(string apiProjectPath)
    {
        Directory.CreateDirectory(Path.Combine(_webRootPath, "assets"));
        File.WriteAllText(
            Path.Combine(_webRootPath, "index.html"),
            "<!doctype html><html><body><app-root>test</app-root></body></html>");
        File.WriteAllText(
            Path.Combine(_webRootPath, "assets", "test.txt"),
            "test asset");

        var sourceImages = Path.Combine(apiProjectPath, "wwwroot", "images");
        var targetImages = Path.Combine(_webRootPath, "images");
        CopyDirectory(sourceImages, targetImages);
    }

    /// <summary>
    /// 遞迴複製目錄內容。
    /// </summary>
    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);

        foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(directory.Replace(source, destination));
        }

        foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            File.Copy(file, file.Replace(source, destination), true);
        }
    }

    /// <summary>
    /// 移除測試資料庫與暫存靜態檔案根目錄。
    /// </summary>
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (File.Exists(_dbPath))
            {
                try { File.Delete(_dbPath); } catch { }
            }

            if (Directory.Exists(_webRootPath))
            {
                try { Directory.Delete(_webRootPath, true); } catch { }
            }
        }
        base.Dispose(disposing);
    }
}

/// <summary>
/// 以 Production 環境啟動的測試主機，用於驗證正式環境的端點限制。
/// </summary>
public class ProductionWebApplicationFactory : CustomWebApplicationFactory
{
    /// <summary>
    /// 先套用基底測試設定，再切換為 Production 環境。
    /// </summary>
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseEnvironment("Production");
    }
}
