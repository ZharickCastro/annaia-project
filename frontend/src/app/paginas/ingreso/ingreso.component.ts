import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Rol } from '../../core/modelos';
import { SesionService } from '../../core/sesion.service';

@Component({
  selector: 'app-ingreso',
  templateUrl: './ingreso.component.html',
})
export class IngresoComponent {
  readonly #sesion = inject(SesionService);
  readonly #router = inject(Router);

  protected readonly roles: Rol[] = ['Estudiante', 'Docente'];
  protected readonly nombre = signal('');
  protected readonly rol = signal<Rol>('Estudiante');
  protected readonly nombreValido = computed(() => {
    const largo = this.nombre().trim().length;
    return largo >= 3 && largo <= 60;
  });

  protected alEscribir(evento: Event): void {
    this.nombre.set((evento.target as HTMLInputElement).value);
  }

  protected entrar(evento: Event): void {
    evento.preventDefault();
    if (!this.nombreValido()) return;
    this.#sesion.iniciar(this.nombre(), this.rol());
    this.#router.navigate([this.rol() === 'Docente' ? '/docente' : '/inicio']);
  }
}
