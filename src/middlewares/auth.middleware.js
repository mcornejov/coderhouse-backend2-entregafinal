import passport from 'passport';
import { BadRequestError, UnauthorizedError } from '../utils/errors.util.js';

/**
 * Envuelve passport.authenticate(estrategia) para que los fallos sigan el formato
 * de error de la API en vez del "Unauthorized" en texto plano de Passport:
 *   - la estrategia entrega un error (done(error))      → middleware global (400/409/500)
 *   - la estrategia falla con status 400 (faltan campos) → 400 con el mensaje de la estrategia
 *   - la estrategia falla sin usuario (done(null, false)) → 401 con mensaje401
 *   - éxito                                              → req.user y next()
 * Siempre session: false, porque la sesión vive en el JWT, no en el servidor
 * (passport-local lee badRequestMessage de estas opciones, no de su constructor).
 * @param {string} estrategia nombre registrado en passport.config.js
 * @param {{ mensaje401?: string }} [opciones]
 * @returns {import('express').RequestHandler}
 */
const OPCIONES_AUTHENTICATE = {
  session: false,
  // Mensaje con el que passport-local falla (status 400) si falta email o password
  badRequestMessage: 'Faltan campos obligatorios',
};

export function autenticarCon(estrategia, { mensaje401 = 'No autenticado' } = {}) {
  return (req, res, next) => {
    passport.authenticate(estrategia, OPCIONES_AUTHENTICATE, (error, user, info, status) => {
      if (error) {
        return next(error);
      }
      if (!user) {
        return next(
          status === 400 ? new BadRequestError(info?.message) : new UnauthorizedError(mensaje401)
        );
      }
      req.user = user;
      return next();
    })(req, res, next);
  };
}

// Middleware de autenticación: usa la estrategia 'current' (JWT desde la cookie
// currentUser o header Bearer). Deja { id, email, role } en req.user o responde
// 401 "No autenticado" sin detallar la causa (sin token, inválido o expirado).
export const auth = autenticarCon('current');
