import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConsultasService } from '../../core/consultas.service';
import { TarjetaConsultaComponent } from '../../shared/tarjeta-consulta.component';

@Component({
  selector: 'app-mis-consultas',
  imports: [TarjetaConsultaComponent],
  templateUrl: './mis-consultas.component.html',
})
export class MisConsultasComponent {
  protected readonly consultas = inject(ConsultasService);
  readonly #router = inject(Router);

  /** Al pulsar una consulta, se vuelve a preguntar en el chat. */
  protected abrir(id: number): void {
    const consulta = this.consultas.historial().find((c) => c.id === id);
    if (consulta) this.#router.navigate(['/anna'], { queryParams: { q: consulta.pregunta } });
  }
}
