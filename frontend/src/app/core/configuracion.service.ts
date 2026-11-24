import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  readonly #tamanoTexto = signal(100);
  readonly #notificaciones = signal(true);

  readonly tamanoTexto = this.#tamanoTexto.asReadonly();
  readonly notificaciones = this.#notificaciones.asReadonly();
  readonly saludo = signal('¡Hola!').asReadonly();

  cambiarTamano(porcentaje: number): void {
    this.#tamanoTexto.set(Math.min(130, Math.max(90, porcentaje)));
  }

  alternarNotificaciones(): void {
    this.#notificaciones.update((v) => !v);
  }
}
