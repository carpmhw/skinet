using API.Dtos;
using AutoMapper;
using Core.Entities;

namespace API.Helper
{
    /// <summary>
    /// 將資料庫中的商品圖片路徑轉換成同源根路徑相對網址。
    /// </summary>
    public class ProductUrlResolver : IValueResolver<Product, ProductToReturnDto, string>
    {
        /// <summary>
        /// 解析商品圖片網址；僅接受安全的站內相對路徑，可疑值一律回傳 null。
        /// </summary>
        public string Resolve(Product source, ProductToReturnDto destination, string destMember, ResolutionContext context)
        {
            if (string.IsNullOrWhiteSpace(source.PictureUrl))
            {
                return null;
            }

            var path = source.PictureUrl.Trim();

            if (path.Contains('\\') || path.Contains(".."))
            {
                return null;
            }

            if (!path.StartsWith('/') && Uri.TryCreate(path, UriKind.Absolute, out _))
            {
                return null;
            }

            path = path.TrimStart('/');

            while (path.Contains("//"))
            {
                path = path.Replace("//", "/");
            }

            return string.IsNullOrEmpty(path) ? null : "/" + path;
        }
    }
}
