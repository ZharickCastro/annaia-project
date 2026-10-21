import { Component, computed, inject, signal } from '@angular/core';
import { ConsultasService } from '../../core/consultas.service';
import { TarjetaConsultaComponent } from '../../shared/tarjeta-consulta.component';

@Component({
  selector: 'app-panel-docente',
  imports: [TarjetaConsultaComponent],
  templateUrl: './panel-docente.component.html',
})
export class PanelDocenteComponent {
  protected readonly consultas = inject(ConsultasService);
  protected readonly soloSinRespuesta = signal(false);
  protected readonly seleccionada = signal<number | null>(null);

  protected readonly lista = computed(() =>
    this.soloSinRespuesta() ? this.consultas.sinRespuesta() : this.consultas.historialGrupo(),
  );

  protected readonly detalle = computed(() =>
    this.consultas.historialGrupo().find((c) => c.id === this.seleccionada()),
  );
}
