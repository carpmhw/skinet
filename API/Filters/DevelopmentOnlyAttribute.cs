using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace API.Filters
{
    /// <summary>
    /// 限制標註的控制器或動作僅能在 Development 環境使用。
    /// </summary>
    public class DevelopmentOnlyAttribute : ActionFilterAttribute
    {
        /// <summary>
        /// 非 Development 環境直接回傳 404，避免公開測試或除錯端點。
        /// </summary>
        public override void OnActionExecuting(ActionExecutingContext context)
        {
            var environment = context.HttpContext.RequestServices
                .GetRequiredService<IWebHostEnvironment>();

            if (!environment.IsDevelopment())
            {
                context.Result = new NotFoundResult();
            }
        }
    }
}
