import { HttpError } from '../utils/errors.util.js';
import { responderError } from '../utils/responses.util.js';

// Manejador global de errores. Traduce los errores de la aplicación a códigos
// HTTP y evita filtrar detalles internos del servidor al cliente.
export function errorHandler(error, req, res, next) {
  if (error instanceof HttpError) {
    return responderError(res, error.status, error.message);
  }

  // express.json() lanza este error cuando el body no es JSON válido
  if (error.type === 'entity.parse.failed') {
    return responderError(res, 400, 'El cuerpo de la petición no es un JSON válido');
  }

  // Body mayor al límite del parser (100 KB por defecto)
  if (error.type === 'entity.too.large') {
    return responderError(res, 413, 'El cuerpo de la petición es demasiado grande');
  }

  // Otros errores del parser de body (charset o codificación no soportados, etc.): traen
  // un status 4xx y expose=true. Se conserva el código pero no el texto en inglés.
  if (error.expose === true && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return responderError(res, error.status, 'La petición no es válida');
  }

  // Express lanza URIError al decodificar una URL con caracteres mal codificados
  if (error instanceof URIError) {
    return responderError(res, 400, 'La URL contiene caracteres mal codificados');
  }

  // Validaciones del esquema de Mongoose (segunda barrera detrás del servicio)
  if (error.name === 'ValidationError') {
    return responderError(res, 400, 'Los datos enviados no son válidos');
  }

  // Mongoose no pudo convertir un valor: un id con formato inválido (kind ObjectId)
  // o un campo de otro tipo que el servicio no alcanzó a validar
  if (error.name === 'CastError') {
    const mensaje = error.kind === 'ObjectId' ? 'El identificador enviado no es válido' : 'Los datos enviados no son válidos';
    return responderError(res, 400, mensaje);
  }

  // Índice único violado. keyPattern dice qué índice fue: el email de User o la inscripción
  // activa (user + event) de Ticket, cuando dos peticiones simultáneas esquivan la verificación
  // del servicio. Cualquier otro índice único recibe un mensaje genérico en vez de uno equivocado.
  if (error.code === 11000) {
    const campos = Object.keys(error.keyPattern ?? {});
    let mensaje = 'Ya existe un registro con esos datos';
    if (campos.includes('email')) mensaje = 'El email ya está registrado';
    if (campos.includes('user') && campos.includes('event')) mensaje = 'Ya tienes una inscripción activa para este evento';
    return responderError(res, 409, mensaje);
  }

  console.error(error);
  return responderError(res, 500, 'Error interno del servidor');
}
