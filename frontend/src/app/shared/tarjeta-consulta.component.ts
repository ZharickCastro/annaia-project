import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Consulta } from '../core/modelos';
import { IconoComponent } from './icono.component';
import { TiempoRelativoPipe } from './tiempo-relativo.pipe';

@Component({
  selector: 'app-tarjeta-consulta',
  imports: [DatePipe, IconoComponent, TiempoRelativoPipe],
  templateUrl: './tarjeta-consulta.component.html',
})
export class TarjetaConsultaComponent {
  readonly consulta = input.required<Consulta>();
  /** Nombre del estudiante; solo se muestra en el panel docente. */
  readonly estudiante = input<string>();
  readonly abrir = output<number>();
}
