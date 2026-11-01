import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'twdPrice',
  standalone: false,
})
export class TwdPricePipe implements PipeTransform {
  private readonly formatter = new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  // 將商品價格格式化為新臺幣，保留有意義的小數並加上千分位。
  transform(value: number): string {
    return `NT$${this.formatter.format(value)}`;
  }
}
