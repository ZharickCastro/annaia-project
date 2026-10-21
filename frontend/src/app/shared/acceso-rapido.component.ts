import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NombreIcono } from '../core/modelos';
import { IconoComponent } from './icono.component';

@Component({
  selector: 'app-acceso-rapido',
  imports: [RouterLink, IconoComponent],
  template: `
    <a class="tarjeta tarjeta-enlace" [routerLink]="ruta()">
      <span class="insignia"><app-icono [nombre]="icono()" /></span>
      <strong>{{ titulo() }}</strong>
      <small>{{ descripcion() }}</small>
    </a>
  `,
})
export class AccesoRapidoComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input.required<string>();
  readonly ruta = input.required<string>();
  readonly icono = input.required<NombreIcono>();
}
