namespace API.Dtos
{
    // HTTP 價格保留字串，避免數值繫結在驗證前接受科學記號或誤判空白。
    public class ProductQueryDto
    {
        public int PageIndex { get; set; } = 1;
        public int PageSize { get; set; } = 6;
        public int? BrandId { get; set; }
        public int? TypeId { get; set; }
        public string Sort { get; set; }
        public string Search { get; set; }
        public string MinPrice { get; set; }
        public string MaxPrice { get; set; }
    }
}
