// Estados de un evento y su máquina de transiciones. Es la única definición: el modelo
// Event la usa como enum, el servicio decide con ella qué cambios de estado acepta y el
// listado valida contra ella el filtro `status`. Cambiar una regla es tocar esta tabla.

export const ESTADOS_EVENTO = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  FINISHED: 'finished',
});

export const EVENT_STATUSES = Object.freeze(Object.values(ESTADOS_EVENTO));

// Todo evento nace como borrador
export const DEFAULT_STATUS = ESTADOS_EVENTO.DRAFT;

// Transiciones permitidas: estado actual → estados a los que puede pasar.
//   draft ──→ published ──→ finished
//     └──────────┴────────→ cancelled
// cancelled y finished son finales: no salen de ahí ni admiten otros cambios.
export const TRANSICIONES = Object.freeze({
  [ESTADOS_EVENTO.DRAFT]: Object.freeze([ESTADOS_EVENTO.PUBLISHED, ESTADOS_EVENTO.CANCELLED]),
  [ESTADOS_EVENTO.PUBLISHED]: Object.freeze([ESTADOS_EVENTO.CANCELLED, ESTADOS_EVENTO.FINISHED]),
  [ESTADOS_EVENTO.CANCELLED]: Object.freeze([]),
  [ESTADOS_EVENTO.FINISHED]: Object.freeze([]),
});

// Derivados de la tabla, para no mantener dos listas que puedan desincronizarse
export const ESTADOS_FINALES = Object.freeze(EVENT_STATUSES.filter((estado) => TRANSICIONES[estado].length === 0));
export const ESTADOS_MODIFICABLES = Object.freeze(EVENT_STATUSES.filter((estado) => !ESTADOS_FINALES.includes(estado)));

/**
 * @param {unknown} estado
 * @returns {boolean}
 */
export function esEstadoValido(estado) {
  return typeof estado === 'string' && EVENT_STATUSES.includes(estado);
}

/**
 * @param {string} desde estado actual
 * @param {string} hacia estado solicitado
 * @returns {boolean}
 */
export function puedeTransicionar(desde, hacia) {
  return (TRANSICIONES[desde] ?? []).includes(hacia);
}

// Largo máximo de los textos del evento (el esquema de Mongoose repite estos límites)
export const LONGITUD_MAXIMA = Object.freeze({
  title: 200,
  description: 2000,
  category: 50,
  location: 200,
});

// Listado: campos por los que se puede ordenar y límites de paginación.
// Siempre se pagina: el límite máximo evita que una petición pida toda la colección.
export const CAMPOS_ORDENABLES = Object.freeze(['date', 'price', 'title', 'capacity', 'createdAt']);
export const ORDEN_POR_DEFECTO = 'date';

export const PAGINACION = Object.freeze({
  PAGINA_POR_DEFECTO: 1,
  LIMITE_POR_DEFECTO: 10,
  LIMITE_MAXIMO: 50,
});
