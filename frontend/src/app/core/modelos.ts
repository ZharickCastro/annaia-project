export type Rol = 'Estudiante' | 'Docente';

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
}

export interface Consulta {
  id: number;
  usuarioId: number;
  pregunta: string;
  respuesta: string;
  fuentes: string[];
  respondida: boolean;
  fecha: Date;
}

export interface Mensaje {
  rol: 'user' | 'assistant';
  texto: string;
  fuentes?: string[];
}

export interface Materia {
  nombre: string;
  descripcion: string;
  icono: NombreIcono;
}

export type NombreIcono =
  | 'inicio'
  | 'biblioteca'
  | 'anna'
  | 'consultas'
  | 'configuracion'
  | 'ayuda'
  | 'docente'
  | 'enviar'
  | 'salir'
  | 'nueva'
  | 'numeros'
  | 'hoja'
  | 'libro'
  | 'sol'
  | 'reloj'
  | 'mundo';
