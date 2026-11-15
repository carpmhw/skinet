import { Component, inject, Input } from '@angular/core';
import { ComparisonService } from './comparison.service';

@Component({
  selector: 'app-comparison-toggle',
  templateUrl: './comparison-toggle.component.html',
  styleUrls: ['./comparison-toggle.component.scss'],
  standalone: false
})
export class ComparisonToggleComponent {
  @Input({ required: true }) productId!: number;
  @Input({ required: true }) productName!: string;
  readonly comparison = inject(ComparisonService);
}
