using System.Net;

namespace API.Tests;

/// <summary>
/// 驗證 Production 環境不公開 Swagger 與刻意觸發錯誤的測試端點。
/// </summary>
public class ProductionSecurityTests : IClassFixture<ProductionWebApplicationFactory>
{
    private readonly HttpClient _client;

    /// <summary>
    /// 建立 Production 環境的測試用 HTTP 用戶端。
    /// </summary>
    public ProductionSecurityTests(ProductionWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task SwaggerUi_IsNotExposed()
    {
        var response = await _client.GetAsync("/swagger/index.html");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SwaggerJson_IsNotExposed()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task BuggyServerError_IsNotExposed()
    {
        var response = await _client.GetAsync("/api/buggy/servererror");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task BuggyNotFound_IsNotExposed()
    {
        var response = await _client.GetAsync("/api/buggy/notfound");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ProductsApi_StillWorks()
    {
        var response = await _client.GetAsync("/api/products?pageSize=1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Root_StillServesAngularIndexHtml()
    {
        var response = await _client.GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
    }
}
