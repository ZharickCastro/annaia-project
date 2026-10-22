import { Component } from '@angular/core';

@Component({
  selector: 'app-ayuda',
  templateUrl: './ayuda.component.html',
})
export class AyudaComponent {
  protected readonly preguntas = [
    {
      pregunta: '¿Anna IA funciona sin internet?',
      respuesta:
        'Sí. Anna IA se ejecuta en un servidor dentro de la escuela, con un modelo de IA local (qwen3.5:9b mediante Ollama) y Wikipedia en español offline, servida con Kiwix.',
    },
    {
      pregunta: '¿Cómo me conecto a Anna IA?',
      respuesta:
        'Conéctate al Wi-Fi del aula y abre en el navegador la dirección del servidor que te indique tu docente. No necesitas datos móviles.',
    },
    {
      pregunta: '¿Qué temas puede responder Anna?',
      respuesta:
        'Matemáticas, ciencias, español, historia, geografía y cultura wayúu, entre muchos otros temas que estén en la biblioteca.',
    },
    {
      pregunta: '¿Tiene algún costo usar Anna IA?',
      respuesta: 'No. Al funcionar sin internet, no genera costos de datos para la institución ni para los estudiantes.',
    },
  ];
}
