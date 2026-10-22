import { Component, ElementRef, OnInit, effect, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConsultasService } from '../../core/consultas.service';
import { PREGUNTAS_FRECUENTES } from '../../core/datos-mock';
import { CampoPreguntaComponent } from '../../shared/campo-pregunta.component';
import { IconoComponent } from '../../shared/icono.component';
import { MensajeComponent } from '../../shared/mensaje.component';

@Component({
  selector: 'app-chat',
  imports: [CampoPreguntaComponent, IconoComponent, MensajeComponent],
  templateUrl: './chat.component.html',
})
export class ChatComponent implements OnInit {
  protected readonly consultas = inject(ConsultasService);
  readonly #ruta = inject(ActivatedRoute);
  readonly #router = inject(Router);
  private readonly registro = viewChild<ElementRef<HTMLElement>>('registro');

  protected readonly sugerencias = PREGUNTAS_FRECUENTES;

  constructor() {
    // Cada vez que cambia la conversación, baja hasta el último mensaje.
    effect(() => {
      this.consultas.mensajes();
      queueMicrotask(() => {
        const el = this.registro()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    // Inicio y Biblioteca abren el chat con ?q=<pregunta>.
    const q = this.#ruta.snapshot.queryParamMap.get('q');
    if (q) {
      this.#router.navigate([], { queryParams: {}, replaceUrl: true });
      this.preguntar(q);
    }
  }

  protected preguntar(pregunta: string): void {
    this.consultas.preguntar(pregunta);
  }
}
