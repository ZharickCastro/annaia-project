import { Consulta, Materia, Usuario } from './modelos';

const HORA = 60 * 60 * 1000;
const haceHoras = (horas: number) => new Date(Date.now() - horas * HORA);

// Datos de prueba de la Entrega 1. En la Entrega 2 se reemplazan por GET /api/consultas.
export const USUARIOS: Usuario[] = [
  { id: 1, nombre: 'Estudiante de prueba', rol: 'Estudiante' },
  { id: 2, nombre: 'María Epieyú', rol: 'Estudiante' },
  { id: 3, nombre: 'José Uriana', rol: 'Estudiante' },
  { id: 4, nombre: 'Luz Pushaina', rol: 'Estudiante' },
  { id: 100, nombre: 'Docente de prueba', rol: 'Docente' },
];

export const CONSULTAS: Consulta[] = [
  {
    id: 1,
    usuarioId: 1,
    pregunta: '¿Cómo funciona un panel solar?',
    respuesta: 'Un panel solar convierte la luz del sol en electricidad mediante células fotovoltaicas.',
    fuentes: ['Panel solar'],
    respondida: true,
    fecha: haceHoras(2),
  },
  {
    id: 2,
    usuarioId: 1,
    pregunta: 'Explícame el ciclo del agua',
    respuesta: 'El agua se evapora, se condensa en nubes y vuelve a caer como lluvia.',
    fuentes: ['Ciclo del agua'],
    respondida: true,
    fecha: haceHoras(5),
  },
  {
    id: 3,
    usuarioId: 1,
    pregunta: 'Háblame sobre la cultura wayúu',
    respuesta: 'Los wayúu son un pueblo indígena que vive en la península de La Guajira.',
    fuentes: ['Wayú'],
    respondida: true,
    fecha: haceHoras(20),
  },
  {
    id: 4,
    usuarioId: 1,
    pregunta: '¿Qué es un ecosistema?',
    respuesta: 'Un ecosistema es un conjunto de seres vivos y el medio en el que viven.',
    fuentes: ['Ecosistema'],
    respondida: true,
    fecha: haceHoras(26),
  },
  {
    id: 5,
    usuarioId: 3,
    pregunta: '¿Quién fue el primer presidente del Concejo de Riohacha?',
    respuesta: 'No encuentro esa información en la biblioteca.',
    fuentes: [],
    respondida: false,
    fecha: haceHoras(30),
  },
  {
    id: 6,
    usuarioId: 1,
    pregunta: 'Ayúdame con una suma de fracciones',
    respuesta: 'Para sumar fracciones con distinto denominador, primero busca un denominador común.',
    fuentes: ['Fracción'],
    respondida: true,
    fecha: haceHoras(50),
  },
  {
    id: 7,
    usuarioId: 1,
    pregunta: '¿Qué es un volcán?',
    respuesta: 'Un volcán es una abertura de la tierra por donde sale magma, gases y ceniza.',
    fuentes: ['Volcán'],
    respondida: true,
    fecha: haceHoras(54),
  },
  {
    id: 8,
    usuarioId: 1,
    pregunta: '¿Qué es la energía solar?',
    respuesta: 'La energía solar es la energía que obtenemos de la luz y el calor del sol.',
    fuentes: ['Energía solar', 'Panel solar'],
    respondida: true,
    fecha: haceHoras(74),
  },
  {
    id: 9,
    usuarioId: 2,
    pregunta: 'Debo hacer un informe sobre los volcanes',
    respuesta: 'No encuentro esa información en la biblioteca.',
    fuentes: [],
    respondida: false,
    fecha: haceHoras(80),
  },
  {
    id: 10,
    usuarioId: 1,
    pregunta: '¿Por qué llueve poco en La Guajira?',
    respuesta: 'La Guajira tiene un clima árido porque los vientos alisios secan el aire.',
    fuentes: ['La Guajira', 'Clima árido'],
    respondida: true,
    fecha: haceHoras(96),
  },
];

export const MATERIAS: Materia[] = [
  { nombre: 'Matemáticas', descripcion: 'Números, fracciones y geometría', icono: 'numeros' },
  { nombre: 'Ciencias Naturales', descripcion: 'Seres vivos, agua y energía', icono: 'hoja' },
  { nombre: 'Español y Literatura', descripcion: 'Lectura, escritura y gramática', icono: 'libro' },
  { nombre: 'Cultura Wayúu', descripcion: 'Historia, lengua y tradiciones', icono: 'sol' },
  { nombre: 'Historia', descripcion: 'Colombia y el mundo', icono: 'reloj' },
  { nombre: 'Geografía', descripcion: 'Mapas, climas y regiones', icono: 'mundo' },
];

export const PREGUNTAS_FRECUENTES = [
  '¿Qué es la energía solar?',
  'Explícame el ciclo del agua',
  'Háblame sobre la cultura wayúu',
  'Ayúdame con las fracciones',
  '¿Qué es un ecosistema?',
  '¿Cómo funciona un panel solar?',
];
