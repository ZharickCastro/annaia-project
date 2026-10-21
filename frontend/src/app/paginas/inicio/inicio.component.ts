import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfiguracionService } from '../../core/configuracion.service';
import { PREGUNTAS_FRECUENTES } from '../../core/datos-mock';
import { NombreIcono } from '../../core/modelos';
import { SesionService } from '../../core/sesion.service';
import { AccesoRapidoComponent } from '../../shared/acceso-rapido.component';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, AccesoRapidoComponent],
  templateUrl: './inicio.component.html',
})
export class InicioComponent {
  protected readonly sesion = inject(SesionService);
  protected readonly configuracion = inject(ConfiguracionService);
  protected readonly preguntas = PREGUNTAS_FRECUENTES;
  protected readonly accesos: { titulo: string; descripcion: string; ruta: string; icono: NombreIcono }[] = [
    { titulo: 'Preguntar a Anna IA', descripcion: 'Resuelve tus dudas con inteligencia artificial offline.', ruta: '/anna', icono: 'anna' },
    { titulo: 'Explorar Biblioteca', descripcion: 'Wikipedia offline y contenido por materia.', ruta: '/biblioteca', icono: 'biblioteca' },
    { titulo: 'Ver mis consultas', descripcion: 'Revisa el historial de tus preguntas.', ruta: '/consultas', icono: 'consultas' },
  ];
}
