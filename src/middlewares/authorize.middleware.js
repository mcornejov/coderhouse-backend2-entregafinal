import { USER_ROLES } from '../config/roles.config.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.util.js';

/**
 * Middleware de autorización por roles. Se encadena después de `auth` (que deja
 * `{ id, email, role }` en req.user) y decide si ese rol puede seguir:
 *   - sin req.user (se olvidó encadenar `auth`)   → 401 No autenticado
 *   - rol no incluido en los permitidos          → 403 No tienes permisos para realizar esta acción
 *   - rol permitido                              → next()
 * 401 y 403 se distinguen a propósito: el primero dice "no sé quién eres"; el
 * segundo, "sé quién eres y no puedes hacer esto".
 *
 * Uso: router.post('/', auth, authorize(...PERMISOS.CREAR_EVENTO), controller.crear)
 *
 * @param {...string} rolesPermitidos roles de config/roles.config.js que pueden pasar
 * @returns {import('express').RequestHandler}
 */
export function authorize(...rolesPermitidos) {
  // Un rol mal escrito ('organiser') bloquearía la ruta en silencio para todos:
  // se detecta al construir la ruta, en el arranque, no en la primera petición.
  if (rolesPermitidos.length === 0) {
    throw new TypeError('authorize(...roles) requiere al menos un rol permitido');
  }
  const desconocidos = rolesPermitidos.filter((rol) => !USER_ROLES.includes(rol));
  if (desconocidos.length > 0) {
    throw new TypeError(`authorize(...roles): roles desconocidos: ${desconocidos.join(', ')}`);
  }

  const permitidos = new Set(rolesPermitidos);

  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!permitidos.has(req.user.role)) {
      return next(new ForbiddenError());
    }
    return next();
  };
}
