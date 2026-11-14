import { Component, inject, Input } from '@angular/core';
import { FavoritesService } from './favorites.service';

@Component({
  selector: 'app-favorite-toggle',
  templateUrl: './favorite-toggle.component.html',
  styleUrls: ['./favorite-toggle.component.scss'],
  standalone: false
})
export class FavoriteToggleComponent {
  @Input({ required: true }) productId!: number;
  @Input({ required: true }) productName!: string;
  readonly favorites = inject(FavoritesService);
}
