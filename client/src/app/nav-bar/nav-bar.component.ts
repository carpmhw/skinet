import { Component, inject } from '@angular/core';
import { CartService } from '../cart/cart.service';
import { FavoritesService } from '../favorites/favorites.service';
import { ComparisonService } from '../comparison/comparison.service';

@Component({
    selector: 'app-nav-bar',
    templateUrl: './nav-bar.component.html',
    styleUrls: ['./nav-bar.component.scss'],
    standalone: false
})
export class NavBarComponent {
  readonly cart = inject(CartService);
  readonly favorites = inject(FavoritesService);
  readonly comparison = inject(ComparisonService);
}
