import { Pipe, PipeTransform } from '@angular/core';

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Convierte una fecha en un texto corto como "Hace 2 horas" o "Ayer". */
@Pipe({ name: 'tiempoRelativo' })
export class TiempoRelativoPipe implements PipeTransform {
  transform(fecha: Date | null | undefined, ahora: number = Date.now()): string {
    if (!fecha) return '';
    const diferencia = Math.max(0, ahora - fecha.getTime());

    if (diferencia < MINUTO) return 'Hace un momento';
    if (diferencia < HORA) return plural(Math.floor(diferencia / MINUTO), 'minuto');
    if (diferencia < DIA) return plural(Math.floor(diferencia / HORA), 'hora');
    if (diferencia < 2 * DIA) return 'Ayer';
    return plural(Math.floor(diferencia / DIA), 'día');
  }
}

function plural(cantidad: number, unidad: string): string {
  return `Hace ${cantidad} ${unidad}${cantidad === 1 ? '' : 's'}`;
}
