import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NavBarComponent } from './nav-bar/nav-bar.component';
import { NotFoundComponent } from './not-found.component';
import { ProductDetailComponent } from './shop/product-detail.component';
import { ProductImageComponent } from './shop/product-image.component';
import { ProductListComponent } from './shop/product-list.component';
import { TwdPricePipe } from './shop/twd-price.pipe';

@NgModule({ declarations: [
        AppComponent,
        NavBarComponent,
        NotFoundComponent,
        ProductListComponent,
        ProductDetailComponent,
        ProductImageComponent,
        TwdPricePipe
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        FormsModule], providers: [provideHttpClient(withInterceptorsFromDi())] })
export class AppModule { }
