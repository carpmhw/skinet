using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using API.Dtos;
using API.Helper;

namespace API.Tests;

/// <summary>
/// 驗證 Angular 與 API 在同一個主機下正確提供服務。
/// </summary>
public class ApiHostingTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };

    /// <summary>
    /// 建立測試用 HTTP 用戶端。
    /// </summary>
    public ApiHostingTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetRoot_ReturnsAngularIndexHtml()
    {
        var response = await _client.GetAsync("/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("app-root", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetIndexHtml_ReturnsAngularIndexHtml()
    {
        var response = await _client.GetAsync("/index.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GetStaticAsset_ReturnsAssetWithMimeType()
    {
        var response = await _client.GetAsync("/assets/test.txt");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("test asset", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetProductImage_ReturnsImage()
    {
        var response = await _client.GetAsync("/images/products/sb-ang1.png");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GetUnknownApiRoute_ReturnsNotFoundWithoutHtml()
    {
        var response = await _client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GetUnknownClientRoute_ReturnsAngularIndexHtml()
    {
        var response = await _client.GetAsync("/some-client-route");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("app-root", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetProduct_ReturnsRootRelativePictureUrl()
    {
        var response = await _client.GetAsync("/api/products/1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var product = await response.Content.ReadFromJsonAsync<ProductToReturnDto>(_jsonOptions);

        Assert.NotNull(product);
        Assert.StartsWith("/images/", product.PictureUrl);
        Assert.DoesNotContain("http", product.PictureUrl);
    }

    [Fact]
    public async Task GetProducts_ReturnsOkJson()
    {
        var response = await _client.GetAsync("/api/products?pageSize=1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        var result = await response.Content.ReadFromJsonAsync<Pagination<ProductToReturnDto>>(_jsonOptions);
        Assert.NotNull(result);
        Assert.Single(result.Data);
    }
}
