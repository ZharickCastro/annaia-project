import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MATERIAS } from '../../core/datos-mock';
import { Materia } from '../../core/modelos';
import { MateriaCardComponent } from '../../shared/materia-card.component';

@Component({
  selector: 'app-biblioteca',
  imports: [MateriaCardComponent],
  templateUrl: './biblioteca.component.html',
})
export class BibliotecaComponent {
  readonly #router = inject(Router);

  protected readonly busqueda = signal('');
  protected readonly materias = computed(() => {
    const texto = normalizar(this.busqueda());
    return MATERIAS.filter((m) => normalizar(`${m.nombre} ${m.descripcion}`).includes(texto));
  });

  protected alBuscar(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  protected abrir(materia: Materia): void {
    this.#router.navigate(['/anna'], { queryParams: { q: `Háblame sobre ${materia.nombre}` } });
  }
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
