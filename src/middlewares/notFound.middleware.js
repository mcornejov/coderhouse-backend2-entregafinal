import { responderError } from '../utils/responses.util.js';

// Se ejecuta cuando ninguna ruta coincidió con la petición
export function notFound(req, res) {
  return responderError(res, 404, `Ruta ${req.method} ${req.originalUrl} no encontrada`);
}
