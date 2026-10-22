import { Component, OnInit, inject, signal } from '@angular/core';
import { ConfiguracionService, Idioma } from '../../core/configuracion.service';

type EstadoServidor = 'revisando' | 'activo' | 'sin-conexion';

@Component({
  selector: 'app-configuracion',
  templateUrl: './configuracion.component.html',
})
export class ConfiguracionComponent implements OnInit {
  protected readonly configuracion = inject(ConfiguracionService);
  protected readonly idiomas: Idioma[] = ['Español', 'Wayuunaiki'];
  protected readonly servidor = location.host;
  protected readonly estado = signal<EstadoServidor>('revisando');

  async ngOnInit(): Promise<void> {
    try {
      const respuestaHttp = await fetch('/health');
      this.estado.set(respuestaHttp.ok ? 'activo' : 'sin-conexion');
    } catch {
      this.estado.set('sin-conexion');
    }
  }

  protected alCambiarTamano(evento: Event): void {
    this.configuracion.cambiarTamano(Number((evento.target as HTMLInputElement).value));
  }
}
