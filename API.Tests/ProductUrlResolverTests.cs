using API.Dtos;
using API.Helper;
using Core.Entities;

namespace API.Tests;

/// <summary>
/// 驗證商品圖片網址一律轉為同源根路徑相對網址，並拒絕可疑輸入。
/// </summary>
public class ProductUrlResolverTests
{
    /// <summary>
    /// 建立待測解析器。
    /// </summary>
    private static ProductUrlResolver CreateResolver()
    {
        return new ProductUrlResolver();
    }

    /// <summary>
    /// 建立只帶圖片路徑的商品實體。
    /// </summary>
    private static Product CreateProduct(string pictureUrl)
    {
        return new Product { PictureUrl = pictureUrl };
    }

    /// <summary>
    /// 解析單一圖片路徑，模擬 AutoMapper 呼叫。
    /// </summary>
    private static string Resolve(string pictureUrl)
    {
        return CreateResolver().Resolve(
            CreateProduct(pictureUrl),
            new ProductToReturnDto(),
            nameof(ProductToReturnDto.PictureUrl),
            null!);
    }

    [Fact]
    public void Resolve_WithDatabaseRelativePath_ReturnsRootRelativeUrl()
    {
        Assert.Equal("/images/products/sb-ang1.png", Resolve("images/products/sb-ang1.png"));
    }

    [Fact]
    public void Resolve_WithLeadingAndRepeatedSlashes_ReturnsSingleRootSlash()
    {
        Assert.Equal("/images/products/sb-ang1.png", Resolve("/images//products///sb-ang1.png"));
    }

    [Fact]
    public void Resolve_WithEmptyValue_ReturnsNull()
    {
        Assert.Null(Resolve(""));
    }

    [Fact]
    public void Resolve_WithWhitespaceValue_ReturnsNull()
    {
        Assert.Null(Resolve("   "));
    }

    [Fact]
    public void Resolve_WithParentDirectoryTraversal_ReturnsNull()
    {
        Assert.Null(Resolve("images/../../etc/passwd"));
    }

    [Fact]
    public void Resolve_WithBackslash_ReturnsNull()
    {
        Assert.Null(Resolve(@"images\products\sb-ang1.png"));
    }

    [Fact]
    public void Resolve_WithAbsoluteUrl_ReturnsNull()
    {
        Assert.Null(Resolve("https://evil.example/images/products/sb-ang1.png"));
    }

    [Fact]
    public void Resolve_WithDangerousScheme_ReturnsNull()
    {
        Assert.Null(Resolve("javascript:alert(1)"));
    }
}
