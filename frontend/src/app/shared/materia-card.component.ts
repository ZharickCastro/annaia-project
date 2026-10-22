import { Component, input, output } from '@angular/core';
import { Materia } from '../core/modelos';
import { IconoComponent } from './icono.component';

@Component({
  selector: 'app-materia-card',
  imports: [IconoComponent],
  template: `
    <button type="button" class="tarjeta tarjeta-enlace" (click)="elegir.emit(materia())">
      <span class="insignia"><app-icono [nombre]="materia().icono" /></span>
      <strong>{{ materia().nombre }}</strong>
      <small>{{ materia().descripcion }}</small>
      <span class="chip chip-ok">Disponible offline</span>
    </button>
  `,
})
export class MateriaCardComponent {
  readonly materia = input.required<Materia>();
  readonly elegir = output<Materia>();
}
