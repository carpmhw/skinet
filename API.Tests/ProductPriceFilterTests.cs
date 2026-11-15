using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using API.Dtos;
using API.Errors;
using API.Helper;
using Core.Entities;
using Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;

namespace API.Tests;

public class ProductPriceFilterTests : IDisposable
{
    private readonly CustomWebApplicationFactory _factory = new();
    private readonly HttpClient _client;
    private readonly int _brandId;
    private readonly int _typeId;
    private readonly int[] _ids;
    private readonly JsonSerializerOptions _json = new() { PropertyNameCaseInsensitive = true };

    // 使用此測試獨有的 SQLite 與價格資料，避免改動共用商品種子。
    public ProductPriceFilterTests()
    {
        _client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StoreContext>();
        var brand = new ProductBrand { Name = "Price fixture" };
        var otherBrand = new ProductBrand { Name = "Other price fixture" };
        var type = new ProductType { Name = "Price type" };
        var otherType = new ProductType { Name = "Other price type" };
        var prices = new[] { 0m, 19.98m, 19.99m, 20m, 20.01m, 99999999.99m };
        var products = prices.Select((price, index) => new Product
        {
            Name = $"Budget {index}", Description = "Price boundary fixture",
            Price = price, PictureUrl = "images/products/test.png",
            ProductBrand = brand, ProductType = type
        }).ToArray();
        db.Products.AddRange(products);
        db.Products.AddRange(
            new Product { Name = "Budget other brand", Description = "Excluded", Price = 20m,
                PictureUrl = "images/products/test.png", ProductBrand = otherBrand, ProductType = type },
            new Product { Name = "Budget other type", Description = "Excluded", Price = 20m,
                PictureUrl = "images/products/test.png", ProductBrand = brand, ProductType = otherType });
        db.SaveChanges();
        _brandId = brand.Id;
        _typeId = type.Id;
        _ids = products.Select(product => product.Id).ToArray();
    }

    // 透過真實 HTTP 與 SQLite 取得隔離後的價格查詢結果。
    private async Task<Pagination<ProductToReturnDto>> GetPage(string query)
    {
        var response = await _client.GetAsync(
            $"/api/products?brandId={_brandId}&typeId={_typeId}&{query}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Pagination<ProductToReturnDto>>(_json))!;
    }

    // 若只過濾當頁或 count 未共用條件，兩頁的筆數與邊界商品會不一致。
    [Fact]
    public async Task FiltersBeforePagingAndCountsSameRange()
    {
        var first = await GetPage("minPrice=19.99&maxPrice=20&pageSize=1&sort=priceAsc");
        var second = await GetPage("minPrice=19.99&maxPrice=20&pageSize=1&sort=priceAsc&pageIndex=2");
        Assert.Equal(2, first.Count);
        Assert.Equal(2, second.Count);
        Assert.Equal(_ids[2], Assert.Single(first.Data).Id);
        Assert.Equal(_ids[3], Assert.Single(second.Data).Id);
    }

    // 單邊、零與相等邊界皆須包含端點，且不遺漏最大金額。
    [Theory]
    [InlineData("", new[] { 0, 1, 2, 3, 4, 5 })]
    [InlineData("minPrice=20", new[] { 3, 4, 5 })]
    [InlineData("maxPrice=19.99", new[] { 0, 1, 2 })]
    [InlineData("minPrice=0&maxPrice=0", new[] { 0 })]
    [InlineData("minPrice=19.99&maxPrice=19.99", new[] { 2 })]
    [InlineData("minPrice=99999999.99", new[] { 5 })]
    [InlineData("maxPrice=99999999.99", new[] { 0, 1, 2, 3, 4, 5 })]
    public async Task IncludesSingleEqualZeroAndMaximumBoundaries(string query, int[] indexes)
    {
        var page = await GetPage($"{query}&pageSize=50&sort=priceAsc");
        Assert.Equal(indexes.Length, page.Count);
        Assert.Equal(indexes.Select(index => _ids[index]), page.Data.Select(product => product.Id));
    }

    // 價格不得取代既有搜尋／品牌／類型條件，排序仍由資料庫處理。
    [Fact]
    public async Task CombinesPriceWithSearchBrandTypeAndSort()
    {
        var page = await GetPage("minPrice=19.99&maxPrice=20&search=BUDGET&sort=priceDesc");
        Assert.Equal(2, page.Count);
        Assert.Equal(new[] { _ids[3], _ids[2] }, page.Data.Select(product => product.Id));
        var named = await GetPage("minPrice=19.99&maxPrice=20&sort=name");
        Assert.Equal(new[] { _ids[2], _ids[3] }, named.Data.Select(product => product.Id));
        var searched = await GetPage("minPrice=19.99&maxPrice=20&search=Budget%202");
        Assert.Equal(_ids[2], Assert.Single(searched.Data).Id);
    }

    // 空白不限；前導零、兩端空白及小數固定以十進位解析。
    [Theory]
    [InlineData("minPrice=&maxPrice=%20%20", 6)]
    [InlineData("minPrice=%200019.90%20&maxPrice=00020.00", 3)]
    public async Task AcceptsBlankPaddedAndLeadingZeroPrices(string query, int count)
    {
        var page = await GetPage(query);
        Assert.Equal(count, page.Count);
    }

    // 非法格式與溢位不能被忽略成無價格的成功結果。
    [Theory]
    [InlineData("-1")]
    [InlineData("+1")]
    [InlineData("1,000")]
    [InlineData("$1")]
    [InlineData("1e2")]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData(".")]
    [InlineData(".5")]
    [InlineData("1.")]
    [InlineData("1.001")]
    [InlineData("100000000")]
    [InlineData("999999999999999999999999999999999999999")]
    public async Task RejectsMalformedPricesWithValidationJson(string value)
    {
        foreach (var key in new[] { "minPrice", "maxPrice" })
        {
            var response = await _client.GetAsync($"/api/products?{key}={Uri.EscapeDataString(value)}");
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
            var error = await response.Content.ReadFromJsonAsync<ApiValidationErrorResponse>(_json);
            Assert.Equal(400, error!.StatusCode);
            Assert.NotEmpty(error.Errors);
        }
    }

    // 上下界反轉不可交換或回傳空的成功頁。
    [Fact]
    public async Task RejectsReversedPricesWithValidationJson()
    {
        var response = await _client.GetAsync("/api/products?minPrice=20.01&maxPrice=20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ApiValidationErrorResponse>(_json);
        Assert.Equal(400, error!.StatusCode);
        Assert.Contains("最低價格不可高於最高價格", error.Errors);
    }

    // 增加價格入口不可改變預設頁數、上限或非價格欄位的 model binding。
    [Fact]
    public async Task PreservesExistingQueryDefaultsAndBindingErrors()
    {
        Assert.Equal(6, (await GetPage("")).PageSize);
        Assert.Equal(50, (await GetPage("pageSize=100")).PageSize);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.GetAsync("/api/products?brandId=oops")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.GetAsync("/api/products?search=")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.GetAsync("/api/products?search=%20%20")).StatusCode);
    }

    // 釋放獨立主機及 HTTP 資源。
    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }
}
