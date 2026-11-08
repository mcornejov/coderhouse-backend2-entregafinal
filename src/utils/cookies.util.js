import config from '../config/env.config.js';

// Nombre de la cookie que transporta el JWT de sesión
export const AUTH_COOKIE_NAME = 'currentUser';

// Vida útil de la cookie: una hora, alineada con la expiración por defecto del token
const AUTH_COOKIE_MAX_AGE_MS = 3600000;

// Opciones de la cookie de autenticación:
// - httpOnly: el token no es accesible desde JavaScript del navegador (mitiga XSS)
// - sameSite 'lax': no viaja en peticiones cross-site iniciadas por terceros (mitiga CSRF)
// - secure: solo por HTTPS en producción; en desarrollo se permite http://localhost
export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

// Para borrar una cookie el navegador exige los mismos atributos con que se creó
// (salvo la duración), de lo contrario la ignora y la sesión seguiría activa.
export function clearAuthCookieOptions() {
  const { maxAge, ...opciones } = authCookieOptions();
  return opciones;
}
