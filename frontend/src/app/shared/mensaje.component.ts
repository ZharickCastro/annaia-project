import { Component, input } from '@angular/core';
import { Mensaje } from '../core/modelos';

@Component({
  selector: 'app-mensaje',
  templateUrl: './mensaje.component.html',
  host: { '[class.propio]': "mensaje().rol === 'user'" },
})
export class MensajeComponent {
  readonly mensaje = input.required<Mensaje>();
}
