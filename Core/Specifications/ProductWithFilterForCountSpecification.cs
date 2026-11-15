using Core.Entities;

namespace Core.Specifications
{
    public class ProductWithFilterForCountSpecification : BaseSpecification<Product>
    {
        // 總筆數沿用列表的包含式價格邊界，不受分頁影響。
        public ProductWithFilterForCountSpecification(ProductSpecParams productParams)    
            : base(x => 
                (string.IsNullOrEmpty(productParams.Search) || x.Name.ToLower().Contains(productParams.Search)) &&
                (!productParams.BrandId.HasValue || x.ProductBrandId == productParams.BrandId) &&
                (!productParams.TypeId.HasValue || x.ProductTypeId == productParams.TypeId) &&
                (!productParams.MinPrice.HasValue || x.Price >= productParams.MinPrice.Value) &&
                (!productParams.MaxPrice.HasValue || x.Price <= productParams.MaxPrice.Value)
            )
        {
            
        }
    }
}
