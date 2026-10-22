import { Injectable, computed, inject, signal } from '@angular/core';
import { CONSULTAS, USUARIOS } from './datos-mock';
import { Consulta, Mensaje } from './modelos';
import { SesionService } from './sesion.service';

const SIN_INFORMACION = 'No encuentro esa información en la biblioteca.';
const MAX_HISTORIAL = 6;

export interface Tema {
  nombre: string;
  veces: number;
}

@Injectable({ providedIn: 'root' })
export class ConsultasService {
  readonly #sesion = inject(SesionService);

  readonly #consultas = signal<Consulta[]>(CONSULTAS);
  readonly #mensajes = signal<Mensaje[]>([]);
  readonly #cargando = signal(false);

  readonly mensajes = this.#mensajes.asReadonly();
  readonly cargando = this.#cargando.asReadonly();

  /** Consultas de todo el grupo, de la más reciente a la más antigua (panel docente). */
  readonly historialGrupo = computed(() =>
    [...this.#consultas()].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()),
  );

  /** Consultas del usuario con sesión (Mis consultas). */
  readonly historial = computed(() => {
    const id = this.#sesion.usuario()?.id;
    return this.historialGrupo().filter((c) => c.usuarioId === id);
  });

  readonly total = computed(() => this.historial().length);

  readonly sinRespuesta = computed(() => this.historialGrupo().filter((c) => !c.respondida));

  readonly temasTop = computed<Tema[]>(() => {
    const conteo = new Map<string, number>();
    for (const c of this.#consultas()) {
      for (const fuente of c.fuentes) conteo.set(fuente, (conteo.get(fuente) ?? 0) + 1);
    }
    return [...conteo]
      .map(([nombre, veces]) => ({ nombre, veces }))
      .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre))
      .slice(0, 5);
  });

  readonly estudiantesActivos = computed(
    () => new Set(this.#consultas().map((c) => c.usuarioId)).size,
  );

  nombreDe(usuarioId: number): string {
    if (usuarioId === this.#sesion.usuario()?.id) return this.#sesion.usuario()!.nombre;
    return USUARIOS.find((u) => u.id === usuarioId)?.nombre ?? 'Estudiante';
  }

  nuevaConversacion(): void {
    if (!this.#cargando()) this.#mensajes.set([]);
  }

  async preguntar(texto: string): Promise<void> {
    const pregunta = texto.trim();
    if (!pregunta || this.#cargando()) return;

    const anteriores = this.#mensajes();
    const fuentesPrevias =
      [...anteriores].reverse().find((m) => m.rol === 'assistant' && m.fuentes?.length)?.fuentes ?? [];
    const conversacion = anteriores
      .filter((m) => m.texto.trim())
      .slice(-MAX_HISTORIAL)
      .map((m) => ({ role: m.rol, content: m.texto }));

    this.#mensajes.update((m) => [...m, { rol: 'user', texto: pregunta }, { rol: 'assistant', texto: '' }]);
    this.#cargando.set(true);

    let respuesta = '';
    let fuentes: string[] = [];
    try {
      // Los nombres de los campos (question, previousSources, history) son los que espera el backend.
      const respuestaHttp = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: pregunta, previousSources: fuentesPrevias, history: conversacion }),
      });
      if (!respuestaHttp.ok || !respuestaHttp.body) {
        const datos = await respuestaHttp.json().catch(() => ({}));
        respuesta = datos.error ?? 'No se pudo obtener la respuesta.';
        this.#actualizarRespuesta(respuesta, fuentes);
        return;
      }

      const cabeceraFuentes = respuestaHttp.headers.get('X-Sources');
      fuentes = cabeceraFuentes ? JSON.parse(decodeURIComponent(cabeceraFuentes)) : [];
      const lector = respuestaHttp.body.getReader();
      const decodificador = new TextDecoder();
      while (true) {
        const { done: terminado, value: fragmento } = await lector.read();
        if (terminado) break;
        respuesta += decodificador.decode(fragmento, { stream: true });
        this.#actualizarRespuesta(respuesta, fuentes);
      }
      this.#registrar(pregunta, respuesta, fuentes);
    } catch {
      this.#actualizarRespuesta('No hay conexión con el servidor de Anna IA.', []);
    } finally {
      this.#cargando.set(false);
    }
  }

  #actualizarRespuesta(texto: string, fuentes: string[]): void {
    this.#mensajes.update((m) => [...m.slice(0, -1), { rol: 'assistant', texto, fuentes }]);
  }

  #registrar(pregunta: string, respuesta: string, fuentes: string[]): void {
    const usuarioId = this.#sesion.usuario()?.id;
    if (usuarioId === undefined) return;
    this.#consultas.update((lista) => [
      ...lista,
      {
        id: Math.max(0, ...lista.map((c) => c.id)) + 1,
        usuarioId,
        pregunta,
        respuesta,
        fuentes,
        respondida: !respuesta.includes(SIN_INFORMACION),
        fecha: new Date(),
      },
    ]);
  }
}
