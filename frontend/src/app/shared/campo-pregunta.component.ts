import { Component, input, output, signal } from '@angular/core';
import { IconoComponent } from './icono.component';

@Component({
  selector: 'app-campo-pregunta',
  imports: [IconoComponent],
  templateUrl: './campo-pregunta.component.html',
})
export class CampoPreguntaComponent {
  readonly deshabilitado = input(false);
  readonly enviar = output<string>();

  protected readonly texto = signal('');

  protected alEscribir(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
  }

  protected alEnviar(evento: Event): void {
    evento.preventDefault();
    const pregunta = this.texto().trim();
    if (!pregunta || this.deshabilitado()) return;
    this.enviar.emit(pregunta);
    this.texto.set('');
  }
}
