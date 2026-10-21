// Proxy de desarrollo: `npm start` envía /api y /health al backend de Anna IA.
// Por defecto usa el servidor del aula; desde otra red se indica la IP al arrancar:
//   ANNA_SERVIDOR=100.x.x.x:3100 npm start        (Git Bash)
//   $env:ANNA_SERVIDOR="100.x.x.x:3100"; npm start (PowerShell)
const servidor = process.env.ANNA_SERVIDOR ?? '192.168.68.60:3100';
const destino = servidor.startsWith('http') ? servidor : `http://${servidor}`;

console.log(`[proxy] /api y /health -> ${destino}`);

const ruta = { target: destino, secure: false, changeOrigin: true };

export default {
  '/api': ruta,
  '/health': ruta,
};
