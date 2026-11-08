import { signToken } from '../utils/jwt.js';
import { AUTH_COOKIE_NAME, authCookieOptions, clearAuthCookieOptions } from '../utils/cookies.util.js';
import { responderExito, responderCreado, responderMensaje } from '../utils/responses.util.js';

// Controlador de sesiones. Las estrategias de Passport (config/passport.config.js)
// ya validaron y dejaron el resultado en req.user; aquí solo se responde en HTTP:
// códigos, emisión del JWT y manejo de la cookie. Sin reglas de negocio.
export default class SessionsController {
  // Tras la estrategia 'register': req.user es el usuario creado (DTO sin contraseña)
  register = (req, res) => {
    return responderCreado(res, req.user);
  };

  // Tras la estrategia 'login': req.user es { id, email, role }. El controller (no la
  // estrategia) firma el JWT y lo guarda en una cookie httpOnly; no viaja en el body.
  login = (req, res) => {
    const token = signToken(req.user);
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    return responderMensaje(res, 'Login correcto');
  };

  // Tras la estrategia 'current': req.user contiene { id, email, role }
  current = (req, res) => {
    return responderExito(res, req.user);
  };

  // No pasa por Passport: basta con eliminar la cookie
  logout = (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
    return responderMensaje(res, 'Sesión cerrada');
  };
}
