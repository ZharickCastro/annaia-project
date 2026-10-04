# Anna IA: guía para el frontend

Este documento es para quien va a terminar el frontend de Anna IA. Explica qué existe, cómo correrlo, con qué habla y qué falta.

## Qué es Anna IA

Asistente educativo para estudiantes de comunidades rurales de La Guajira, sin internet. El backend busca en una copia offline de Wikipedia en español (Kiwix), le pasa los artículos a un modelo local (Ollama, `qwen3.5:9b`) y el modelo responde en español sencillo. El frontend es la pantalla de chat que usan los estudiantes en los computadores del aula.

Detalles del backend y de la instalación completa: `docs/anna-ia-resumen.html` (ábrelo en el navegador).

## Estado actual del frontend

Ya existe y funciona:

- Pantalla de chat (`src/app/app.html`): campo de pregunta, burbujas de usuario y de Anna, indicador de carga y fuentes debajo de cada respuesta.
- Respuestas en streaming: el texto aparece palabra por palabra leyendo el cuerpo de la respuesta.
- Historial de conversación: se envían los últimos 6 mensajes y las fuentes de la respuesta anterior, para que los seguimientos ("¿y cuál es el más peligroso?") funcionen.
- PWA instalable: `manifest.webmanifest`, iconos de 72 a 512 px y service worker (`ngsw-config.json`). Se registra solo en producción.
- Material: toolbar, campo de formulario, botón y barra de progreso de Angular Material.
- Sin dependencias externas: no carga fuentes ni scripts de internet, porque la escuela no tiene conexión.

Pruebas hechas: envío con Enter y con botón, respuestas en burbujas sin errores en consola, y conversación de cuatro turnos.

## Cómo correrlo

Requisitos: Node.js y npm. Las dependencias están en `frontend/package.json` (Angular 22, Material 22, PWA).

```bash
cd frontend
npm install
npm run build        # genera frontend/dist/frontend/browser
```

El backend sirve esa carpeta en `http://127.0.0.1:3100/`. Para que la app funcione, el backend y sus servicios tienen que estar corriendo (ver la sección "Arrancar los servicios" del resumen HTML).

Para desarrollo con recarga automática:

```bash
npm start            # ng serve en http://localhost:4200
```

Esto no funciona tal cual todavía: la app llama a `/api/ask` (ruta relativa) y el servidor de desarrollo de Angular no sabe a dónde mandarla. Hace falta un `proxy.conf.json` (ver "Pendientes").

## Cómo habla con el backend

Una sola llamada: `POST /api/ask` en el mismo origen.

Entrada (JSON):

```json
{
  "question": "¿Qué es un volcán?",
  "previousSources": ["Volcán"],
  "history": [
    { "role": "user", "content": "¿Qué es un volcán?" },
    { "role": "assistant", "content": "Un volcán es..." }
  ]
}
```

- `question`: texto de la pregunta. Obligatorio.
- `previousSources`: títulos de las fuentes de la última respuesta que las tuvo. Opcional.
- `history`: últimos mensajes de la conversación, solo `role` (`user` o `assistant`) y `content`. El backend toma los últimos 6 y recorta cada mensaje a 1.000 caracteres.

Salida:

- Cuerpo: texto plano en streaming. Se lee con `res.body.getReader()`.
- Cabecera `X-Sources`: lista JSON de títulos, codificada con `encodeURIComponent`. Ejemplo: `["Charles Darwin","Homenajes a Charles Darwin"]`. Ojo: la app debe decodificarla antes de hacer `JSON.parse`.
- Si la biblioteca no está disponible, el texto empieza con un aviso fijo: "La biblioteca no está disponible. Esta respuesta viene del modelo y no está verificada." La interfaz debería mostrarlo de forma destacada, porque es información que el estudiante necesita ver.

Errores:

- `400`: falta `question`.
- `503`: hay muchas consultas en espera. Mostrar "Intenta de nuevo en un momento".
- `502`: no se pudo generar la respuesta.
- Cualquier error de red: el backend no responde.

Estado del servidor: `GET /health` devuelve `{"kiwix": true, "ollama": true, "running": 0, "waiting": 0}`. Sirve para mostrar un aviso cuando el backend no esté disponible.

## Archivos clave

| Archivo | Qué hace |
|---|---|
| `src/app/app.ts` | Lógica: envío de preguntas, historial, lectura del streaming, scroll automático |
| `src/app/app.html` | Plantilla: toolbar, burbujas, fuentes, formulario |
| `src/app/app.css` | Estilos de la pantalla de chat |
| `src/app/app.config.ts` | Registro del service worker |
| `src/app/app.routes.ts` | Rutas (vacío por ahora) |
| `src/index.html` | Idioma español, título "Anna IA", manifest, sin fuentes externas |
| `src/styles.css` | Fuente del sistema y estilos globales |
| `src/material-theme.scss` | Tema de Angular Material |
| `public/manifest.webmanifest` | Nombre, colores e iconos de la PWA |
| `ngsw-config.json` | Qué archivos guarda el service worker para uso sin internet |

## Pendientes

Ordenados por importancia para la escuela:

1. **Proxy de desarrollo:** crear `frontend/proxy.conf.json` con `/api` apuntando a `http://127.0.0.1:3100` y configurarlo en `angular.json` para que `npm start` funcione.
2. **Aviso de modo sin biblioteca:** mostrarlo como un bloque destacado en lugar de texto normal.
3. **Estado del backend:** consultar `/health` y mostrar un mensaje claro si no responde.
4. **Lista de conversación:** limpiar el historial con un botón "Nueva conversación" (hoy solo se borra al recargar la página).
5. **Accesibilidad y tamaño:** probar con lector de pantalla y en pantallas pequeñas (400 px de ancho).
6. **Panel del docente y módulo "Guía Docente":** no existen todavía. El documento de la propuesta los pide. Las guías de clase se guardarían en la base de datos del backend.
7. **Iconos:** no hay fuente de iconos local. Si se quieren iconos, hay que incluir la fuente en el proyecto (la de Google no sirve sin internet).
8. **Pruebas:** `app.spec.ts` es la plantilla por defecto y no prueba nada útil. Falta cubrir el envío, el streaming y el historial.
9. **Instalación como PWA:** el service worker solo funciona en `localhost` o HTTPS. Para instalarla en los equipos del aula hace falta el certificado local de `anna.local` (pendiente del backend y la red).

## Cuidados

- Después de cambiar la app, el navegador puede seguir mostrando la versión anterior por el service worker. Para probar cambios: abrir las herramientas de desarrollo, "Application" → "Service Workers" → "Unregister", y recargar.
- No agregar fuentes ni scripts desde internet. La escuela no tiene conexión.
- Las respuestas vienen del modelo y de la biblioteca: no mostrar nada que no venga del backend como si fuera un dato verificado.
- El contenido etnoeducativo (glosario wayuunaiki) todavía no existe. No inventar traducciones en la interfaz.
- El repositorio es https://github.com/ZharickCastro/annaia-project. Crear una rama para los cambios y revisarlos antes de unir a `main`.
