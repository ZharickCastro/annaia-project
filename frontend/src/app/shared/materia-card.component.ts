import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Materia } from '../core/modelos';

@Component({
  selector: 'app-materia-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button (click)="elegir.emit(materia)" [ngClass]="temaClase" class="card-materia">
      <div class="cenefa-wayuu"></div>

      <!-- Ilustración protagonizando toda la mitad derecha -->
      <div class="ilustracion-wrapper">
        <img
          [src]="'/img/materias/' + getIlustracion(materia.nombre)"
          [alt]="materia.nombre"
          class="ilustracion-img"
          (error)="onImgError($event)"
        />
      </div>

      <div class="card-top">
        <div class="icono-caja">
          <span>{{ getIcono(materia.nombre) }}</span>
        </div>
      </div>

      <div class="card-info">
        <h3>{{ materia.nombre }}</h3>
        <p>{{ materia.descripcion }}</p>
      </div>

      <div class="card-footer">
        <span class="badge-offline">🟢 Disponible offline</span>
      </div>
    </button>
  `,
  styles: [`
    .card-materia {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 100%;
      height: 195px;
      padding: 1.15rem 1.25rem;
      border-radius: 20px;
      border: 3px solid #FFFFFF;
      text-align: left;
      cursor: pointer;
      overflow: hidden;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }

    .card-materia:hover {
      transform: translateY(-4px);
      box-shadow: 0 14px 24px rgba(0, 0, 0, 0.18);
    }

    .cenefa-wayuu {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 16px;
      z-index: 3;
      /* Tejido wayuu (styles.css → --tejido-wayuu). */
      background: var(--tejido-wayuu) repeat-x left center / auto 100%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
    }

    /* Ilustración grande a la derecha integrada suavemente con el fondo */
    .ilustracion-wrapper {
      position: absolute;
      top: 16px;
      right: 0;
      bottom: 0;
      width: 56%;
      background-color: #FFFFFF;
      z-index: 1;
      overflow: hidden;
      /* Degradado suave en el borde izquierdo para que se funda con la tarjeta */
      -webkit-mask-image: linear-gradient(to right, transparent 0%, black 22%);
      mask-image: linear-gradient(to right, transparent 0%, black 22%);
      transition: transform 0.3s ease;
    }

    .card-materia:hover .ilustracion-wrapper {
      transform: scale(1.04);
    }

    .ilustracion-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      pointer-events: none;
    }

    .card-top {
      position: relative;
      z-index: 2;
      margin-top: 0.35rem;
    }

    .icono-caja {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.94);
      width: 42px;
      height: 42px;
      border-radius: 12px;
      font-size: 1.35rem;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
    }

    .card-info {
      position: relative;
      z-index: 2;
      max-width: 52%;
      margin-top: auto;
    }

    .card-info h3 {
      margin: 0 0 0.2rem 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #FFFFFF;
      line-height: 1.15;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
    }

    .card-info p {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      line-height: 1.25;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    }

    .card-footer {
      position: relative;
      z-index: 2;
      margin-top: 0.65rem;
    }

    .badge-offline {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background-color: #FFFFFF;
      color: var(--ok);
      font-size: 0.74rem;
      font-weight: 800;
      padding: 0.35rem 0.75rem;
      border-radius: 10px;
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.16);
    }

    /* Colores vivos inspirados en los tejidos wayuu: naranja, verde, fucsia, turquesa, dorado y azul. */
    .tema-matematicas { background: linear-gradient(135deg, #ff8a1f 0%, #e4570c 100%); }
    .tema-ciencias    { background: linear-gradient(135deg, #22b35e 0%, #0f7a43 100%); }
    .tema-espanol     { background: linear-gradient(135deg, #e91e7a 0%, #9c1457 100%); }
    .tema-wayuu       { background: linear-gradient(135deg, #17b3a8 0%, #0b6e6a 100%); }
    .tema-historia    { background: linear-gradient(135deg, #f5a524 0%, #c2620a 100%); }
    .tema-geografia   { background: linear-gradient(135deg, #2f8ae8 0%, #1553a8 100%); }
    .tema-default     { background: linear-gradient(135deg, #ff8a1f 0%, #e4570c 100%); }
  `]
})
export class MateriaCardComponent {
  @Input({ required: true }) materia!: Materia;
  @Output() elegir = new EventEmitter<Materia>();

  get temaClase(): string {
    const n = this.materia.nombre.toLowerCase();
    if (n.includes('matemát')) return 'tema-matematicas';
    if (n.includes('naturales') || n.includes('ciencias')) return 'tema-ciencias';
    if (n.includes('español') || n.includes('literat')) return 'tema-espanol';
    if (n.includes('wayúu') || n.includes('cultura')) return 'tema-wayuu';
    if (n.includes('historia')) return 'tema-historia';
    if (n.includes('geograf')) return 'tema-geografia';
    return 'tema-default';
  }

  getIcono(nombre: string): string {
    const n = nombre.toLowerCase();
    if (n.includes('matemát')) return '🔢';
    if (n.includes('naturales') || n.includes('ciencias')) return '🌿';
    if (n.includes('español') || n.includes('literat')) return '📕';
    if (n.includes('wayúu') || n.includes('cultura')) return '☀️';
    if (n.includes('historia')) return '⏳';
    if (n.includes('geograf')) return '🌍';
    return '📖';
  }

  getIlustracion(nombre: string): string {
    const n = nombre.toLowerCase();
    if (n.includes('matemát')) return 'matematicas.jpg';
    if (n.includes('naturales') || n.includes('ciencias')) return 'ciencias.jpg';
    if (n.includes('español') || n.includes('literat')) return 'literatura.jpg';
    if (n.includes('wayúu') || n.includes('cultura')) return 'wayuu.jpg';
    if (n.includes('historia')) return 'historia.jpg';
    if (n.includes('geograf')) return 'geografia.jpg';
    return 'defecto.jpg';
  }

  onImgError(event: any) {
    event.target.parentElement.style.display = 'none';
  }
}