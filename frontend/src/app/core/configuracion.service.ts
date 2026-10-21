import { Injectable, computed, signal } from '@angular/core';

export type Idioma = 'Español' | 'Wayuunaiki';

@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  readonly #idioma = signal<Idioma>('Español');
  readonly #tamanoTexto = signal(100);
  readonly #notificaciones = signal(true);

  readonly idioma = this.#idioma.asReadonly();
  readonly tamanoTexto = this.#tamanoTexto.asReadonly();
  readonly notificaciones = this.#notificaciones.asReadonly();
  readonly saludo = computed(() => (this.#idioma() === 'Wayuunaiki' ? '¡Jamaya!' : '¡Hola!'));

  cambiarIdioma(idioma: Idioma): void {
    this.#idioma.set(idioma);
  }

  cambiarTamano(porcentaje: number): void {
    this.#tamanoTexto.set(Math.min(130, Math.max(90, porcentaje)));
  }

  alternarNotificaciones(): void {
    this.#notificaciones.update((v) => !v);
  }
}
