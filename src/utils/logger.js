// Registro mínimo de la aplicación. Centralizarlo permite silenciarlo en los tests y, más
// adelante, cambiar el destino (archivo, servicio externo) sin tocar el resto del código.
const silencioso = process.env.NODE_ENV === 'test';

export function logInfo(...mensaje) {
  if (!silencioso) console.info(...mensaje);
}

export function logError(...mensaje) {
  if (!silencioso) console.error(...mensaje);
}
