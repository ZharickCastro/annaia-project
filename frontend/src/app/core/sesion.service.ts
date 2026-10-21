import { Injectable, computed, signal } from '@angular/core';
import { Rol, Usuario } from './modelos';

const CLAVE = 'anna-sesion';

// En la Entrega 1 el estudiante usa el id 1 y el docente el id 100 para ver los datos mock.
const ID_DEMO: Record<Rol, number> = { Estudiante: 1, Docente: 100 };

@Injectable({ providedIn: 'root' })
export class SesionService {
  readonly #usuario = signal<Usuario | null>(leerSesion());

  readonly usuario = this.#usuario.asReadonly();
  readonly haySesion = computed(() => this.#usuario() !== null);
  readonly esDocente = computed(() => this.#usuario()?.rol === 'Docente');

  iniciar(nombre: string, rol: Rol): void {
    const usuario: Usuario = { id: ID_DEMO[rol], nombre: nombre.trim(), rol };
    this.#usuario.set(usuario);
    guardarSesion(usuario);
  }

  salir(): void {
    this.#usuario.set(null);
    guardarSesion(null);
  }
}

function leerSesion(): Usuario | null {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

function guardarSesion(usuario: Usuario | null): void {
  try {
    if (usuario) sessionStorage.setItem(CLAVE, JSON.stringify(usuario));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento disponible la sesión dura hasta recargar la página.
  }
}
