import jwt from 'jsonwebtoken';
import config from '../config/env.config.js';

// Algoritmo fijado por el servidor. Nunca se toma del header del token recibido:
// así se evita que un atacante fuerce "none" u otro algoritmo más débil.
// Lo usan tanto la firma (aquí) como la verificación (estrategia 'current' de Passport).
export const JWT_ALGORITHM = 'HS256';

/**
 * Firma un JWT con el secreto y la expiración configurados por entorno.
 * El payload debe contener solo datos mínimos del usuario (id, email, role);
 * nunca la contraseña ni su hash, porque el contenido de un JWT es legible.
 * @param {{ id: string, email: string, role: string }} payload
 * @returns {string} token firmado
 */
export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwtExpiresIn,
  });
}
