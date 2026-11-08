// Roles de la plataforma y matriz de permisos. Es la única definición de "quién puede
// hacer qué": los routers la consultan a través del middleware authorize(...roles) y el
// modelo User la usa como enum. Cambiar un permiso es tocar una línea de esta tabla,
// no buscar comparaciones de rol repartidas por el código.

export const ROLES = Object.freeze({
  USER: 'user',
  ORGANIZER: 'organizer',
  ADMIN: 'admin',
});

// Lista ordenada de menor a mayor privilegio; el primero es el rol por defecto al registrarse
export const USER_ROLES = Object.freeze(Object.values(ROLES));

export const DEFAULT_ROLE = ROLES.USER;

// Matriz de permisos: acción → roles que la tienen. Las acciones sin entrada no las
// tiene nadie (cerrado por defecto). "Consultar eventos" no figura porque el listado y el
// detalle son públicos: también los ve quien no inició sesión.
export const PERMISOS = Object.freeze({
  // Eventos
  CREAR_EVENTO: Object.freeze([ROLES.ORGANIZER, ROLES.ADMIN]),
  // organizer solo los propios (lo verifica el servicio con el evento ya cargado); admin cualquiera
  MODIFICAR_EVENTO: Object.freeze([ROLES.ORGANIZER, ROLES.ADMIN]),
  // publicar, cancelar o finalizar: misma regla de propiedad que modificar
  CAMBIAR_ESTADO_EVENTO: Object.freeze([ROLES.ORGANIZER, ROLES.ADMIN]),
  // Inscripciones de un evento: organizer solo las de sus eventos (lo verifica el servicio); admin todas.
  // Inscribirse y cancelar la propia inscripción no figuran: basta estar autenticado (cualquier rol).
  VER_INSCRIPCIONES_EVENTO: Object.freeze([ROLES.ORGANIZER, ROLES.ADMIN]),
  // Usuarios (administración)
  VER_USUARIOS: Object.freeze([ROLES.ADMIN]),
  ASIGNAR_ROL: Object.freeze([ROLES.ADMIN]),
});

/**
 * Indica si el rol puede saltarse la restricción de propiedad sobre un recurso.
 * @param {string} role
 * @returns {boolean}
 */
export function esAdmin(role) {
  return role === ROLES.ADMIN;
}

/**
 * @param {unknown} role
 * @returns {boolean}
 */
export function esRolValido(role) {
  return typeof role === 'string' && USER_ROLES.includes(role);
}
