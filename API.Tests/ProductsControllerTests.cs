using System.Net;
using System.Net.Http.Json;
using API.Helper;
using API.Dtos;
using Core.Entities;
using System.Text.Json;

namespace API.Tests;

public class ProductsControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public ProductsControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    }

    [Fact]
    public async Task GetProducts_ReturnsOkWithPagination()
    {
        var response = await _client.GetAsync("/api/products?pageSize=50");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<Pagination<ProductToReturnDto>>(_jsonOptions);
        Assert.NotNull(result);
        Assert.NotNull(result.Data);
        Assert.True(result.Count > 0);
        Assert.Equal(1, result.PageIndex);
    }

    [Fact]
    public async Task GetProducts_RespectsPaginationParams()
    {
        var response = await _client.GetAsync("/api/products?pageIndex=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<Pagination<ProductToReturnDto>>(_jsonOptions);
        Assert.NotNull(result);
        Assert.Equal(1, result.PageIndex);
        Assert.Equal(2, result.PageSize);
        Assert.True(result.Data.Count <= 2);
    }

    [Fact]
    public async Task GetProduct_WithValidId_ReturnsProduct()
    {
        var response = await _client.GetAsync("/api/products/1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var product = await response.Content.ReadFromJsonAsync<ProductToReturnDto>(_jsonOptions);
        Assert.NotNull(product);
        Assert.NotEmpty(product.Name);
    }

    [Fact]
    public async Task GetProduct_WithInvalidId_ReturnsNotFound()
    {
        var response = await _client.GetAsync("/api/products/9999");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetProductBrands_ReturnsBrands()
    {
        var response = await _client.GetAsync("/api/products/brands");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var brands = await response.Content.ReadFromJsonAsync<List<ProductBrand>>(_jsonOptions);
        Assert.NotNull(brands);
        Assert.True(brands.Count > 0);
    }

    [Fact]
    public async Task GetProductTypes_ReturnsTypes()
    {
        var response = await _client.GetAsync("/api/products/types");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var types = await response.Content.ReadFromJsonAsync<List<ProductType>>(_jsonOptions);
        Assert.NotNull(types);
        Assert.True(types.Count > 0);
    }
}
