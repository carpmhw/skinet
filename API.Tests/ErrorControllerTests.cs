using System.Net;
using System.Net.Http.Json;
using API.Errors;
using System.Text.Json;

namespace API.Tests;

public class ErrorControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly JsonSerializerOptions _jsonOptions;

    public ErrorControllerTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
        _jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    }

    [Fact]
    public async Task GetNotFoundRequest_Returns404()
    {
        var response = await _client.GetAsync("/api/buggy/notfound");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var apiResponse = await response.Content.ReadFromJsonAsync<ApiResponse>(_jsonOptions);
        Assert.NotNull(apiResponse);
        Assert.Equal(404, apiResponse.StatusCode);
    }

    [Fact]
    public async Task GetBadRequest_Returns400()
    {
        var response = await _client.GetAsync("/api/buggy/bagrequest");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var apiResponse = await response.Content.ReadFromJsonAsync<ApiResponse>(_jsonOptions);
        Assert.NotNull(apiResponse);
        Assert.Equal(500, apiResponse.StatusCode);
    }

    [Fact]
    public async Task GetNotFoundError_Returns404()
    {
        var response = await _client.GetAsync("/errors/404");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var apiResponse = await response.Content.ReadFromJsonAsync<ApiResponse>(_jsonOptions);
        Assert.NotNull(apiResponse);
        Assert.Equal(404, apiResponse.StatusCode);
    }
}
