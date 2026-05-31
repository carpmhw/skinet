import { Component, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { IProduct } from './models/product';
import { IPagination } from './models/pagination';
import { environment } from '../environments/environment';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent implements OnInit {
  title = 'Skinet';
  products: IProduct[] = [];
  private http = inject(HttpClient);

  ngOnInit(): void {
    this.http.get<IPagination>(`${environment.apiUrl}products?pageSize=50`).subscribe({
      next: response => this.products = response.data,
      error: error => console.log(error)
    });
  }
}
