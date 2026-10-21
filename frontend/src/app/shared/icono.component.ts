import { Component, computed, input } from '@angular/core';
import { NombreIcono } from '../core/modelos';

const circulo = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

// Íconos dibujados en SVG dentro de la app: no se descarga ninguna fuente de íconos.
const TRAZOS: Record<NombreIcono, string> = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  biblioteca: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  anna: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  consultas: `${circulo(12, 12, 9)}M12 7v5l3 2`,
  configuracion: `M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1${circulo(15, 6, 2)}${circulo(9, 12, 2)}${circulo(17, 18, 2)}`,
  ayuda: `${circulo(12, 12, 9)}M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17.5v.01`,
  docente: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6',
  enviar: 'M4 12l16-8-6 16-2.5-6.5z',
  salir: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10',
  nueva: 'M12 5v14M5 12h14',
  numeros: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  hoja: 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l7-7',
  libro: 'M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v14.5',
  sol: `${circulo(12, 12, 4)}M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4`,
  reloj: 'M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9',
  mundo: `${circulo(12, 12, 9)}M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z`,
};

@Component({
  selector: 'app-icono',
  template: `<svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="trazo()" /></svg>`,
  styles: `
    :host { display: inline-flex; width: 1.25em; height: 1.25em; flex-shrink: 0; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.8;
          stroke-linecap: round; stroke-linejoin: round; }
  `,
})
export class IconoComponent {
  readonly nombre = input.required<NombreIcono>();
  protected readonly trazo = computed(() => TRAZOS[this.nombre()]);
}
