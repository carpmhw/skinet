using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using API.Dtos;
using API.Errors;
using API.Helper;
using AutoMapper;
using Core.Entities;
using Core.Interfaces;
using Core.Specifications;
using Infrastructure.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers
{
    public class ProductsController : BaseApiController
    {
        private readonly IGenericRepository<Product> _productRepo;
        private readonly IGenericRepository<ProductBrand> _productBrandRepo;
        private readonly IGenericRepository<ProductType> _productTypeRepo;
        private readonly IMapper _mapper;

        public ProductsController(IGenericRepository<Product> productRepo,
        IGenericRepository<ProductBrand> productBrandRepo, IGenericRepository<ProductType> productTypeRepo,
        IMapper mapper)
        {
            _mapper = mapper;
            _productTypeRepo = productTypeRepo;
            _productBrandRepo = productBrandRepo;
            _productRepo = productRepo;
        }

        [HttpGet]
        // 在 HTTP 邊界驗證原始價格，僅將合法 decimal 條件交給資料庫規格。
        public async Task<ActionResult<Pagination<ProductToReturnDto>>> GetProducts(
            [FromQuery] ProductQueryDto query)
        {
            var prices = new decimal?[2];
            var inputs = new[] { query.MinPrice, query.MaxPrice };
            var errors = new List<string>();
            // 沿用原入口對明確空搜尋的 400，不讓價格 DTO 改變非價格查詢語意。
            if (query.Search == null && Request.Query.ContainsKey("search"))
                errors.Add("The value '' is invalid.");
            for (var index = 0; index < inputs.Length; index++)
            {
                var input = inputs[index]?.Trim();
                if (string.IsNullOrEmpty(input)) continue;
                if (!Regex.IsMatch(input, @"\A[0-9]+(?:\.[0-9]{1,2})?\z") ||
                    !decimal.TryParse(input, NumberStyles.AllowDecimalPoint,
                        CultureInfo.InvariantCulture, out var price) ||
                    price > 99999999.99m)
                {
                    errors.Add("請輸入0至99,999,999.99之間的金額，最多兩位小數");
                    continue;
                }
                prices[index] = price;
            }
            if (prices[0].HasValue && prices[1].HasValue && prices[0] > prices[1])
                errors.Add("最低價格不可高於最高價格");
            if (errors.Count > 0)
                return BadRequest(new ApiValidationErrorResponse { Errors = errors });

            var productParams = new ProductSpecParams
            {
                PageIndex = query.PageIndex, PageSize = query.PageSize,
                BrandId = query.BrandId, TypeId = query.TypeId, Sort = query.Sort,
                MinPrice = prices[0], MaxPrice = prices[1]
            };
            if (query.Search != null) productParams.Search = query.Search;

            var spec = new ProductsWithTypesAndBrandsSpecification(productParams);
            
            var countSpec = new ProductWithFilterForCountSpecification(productParams);

            var totalItems = await _productRepo.CountAsync(countSpec);

            var products = await _productRepo.ListAsync(spec);

            var data = _mapper.Map<IReadOnlyList<Product>, IReadOnlyList<ProductToReturnDto>>(products);

            return Ok(new Pagination<ProductToReturnDto>(productParams.PageIndex, productParams.PageSize, totalItems, data));
        }

        [HttpGet("{id}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
        public async Task<ActionResult<ProductToReturnDto>> GetProduct(int id)
        {
            var spec = new ProductsWithTypesAndBrandsSpecification(id);

            var product = await _productRepo.GetEntityWithSpec(spec);

            if(product == null) { return NotFound(new ApiResponse(404)); }

            return _mapper.Map<Product, ProductToReturnDto>(product);
        }

        [HttpGet("brands")]
        public async Task<ActionResult<List<Product>>> GetProductBrands()
        {
            return Ok(await _productBrandRepo.ListAllAsync());
        }

        [HttpGet("types")]
        public async Task<ActionResult<List<Product>>> GetProductTypes()
        {
            return Ok(await _productTypeRepo.ListAllAsync());
        }
    }
}
