import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ConfiguracionService } from '../core/configuracion.service';
import { ConsultasService } from '../core/consultas.service';
import { NombreIcono } from '../core/modelos';
import { SesionService } from '../core/sesion.service';
import { IconoComponent } from '../shared/icono.component';

interface Enlace {
  ruta: string;
  texto: string;
  icono: NombreIcono;
}

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconoComponent],
  templateUrl: './layout.component.html',
  host: { '[style.font-size.%]': 'configuracion.tamanoTexto()' },
})
export class LayoutComponent {
  protected readonly sesion = inject(SesionService);
  protected readonly consultas = inject(ConsultasService);
  protected readonly configuracion = inject(ConfiguracionService);
  readonly #router = inject(Router);
  readonly #ruta = inject(ActivatedRoute);

  protected readonly enlaces: Enlace[] = [
    { ruta: '/inicio', texto: 'Inicio', icono: 'inicio' },
    { ruta: '/biblioteca', texto: 'Biblioteca', icono: 'biblioteca' },
    { ruta: '/anna', texto: 'Anna IA', icono: 'anna' },
    { ruta: '/consultas', texto: 'Mis consultas', icono: 'consultas' },
    { ruta: '/configuracion', texto: 'Configuración', icono: 'configuracion' },
    { ruta: '/ayuda', texto: 'Ayuda', icono: 'ayuda' },
  ];

  protected readonly titulo = toSignal(
    this.#router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map(() => this.#tituloActual()),
    ),
    { initialValue: this.#tituloActual() },
  );

  protected salir(): void {
    this.sesion.salir();
    this.#router.navigate(['/ingreso']);
  }

  #tituloActual(): string {
    let ruta = this.#ruta.snapshot;
    while (ruta.firstChild) ruta = ruta.firstChild;
    return ruta.title ?? 'Anna IA';
  }
}
