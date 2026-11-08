// Estados de un ticket (inscripción) y reglas numéricas. Única definición: el modelo la usa como
// enum, el servicio decide con ella y el cálculo de cupos solo cuenta los estados activos.

export const ESTADOS_TICKET = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
});

export const TICKET_STATUSES = Object.freeze(Object.values(ESTADOS_TICKET));

// Una inscripción nace confirmada: hoy no hay pago ni aprobación intermedia. `pending` queda
// definido por el contrato de la entidad (reservado para un flujo de pago) y, si existiera,
// ocuparía cupo igual que una confirmada: un lugar reservado no se vende dos veces.
export const DEFAULT_TICKET_STATUS = ESTADOS_TICKET.CONFIRMED;

// Estados que ocupan cupo. Un ticket cancelled no cuenta: al cancelar, el cupo se libera solo.
export const ESTADOS_ACTIVOS = Object.freeze([ESTADOS_TICKET.CONFIRMED, ESTADOS_TICKET.PENDING]);

// Lugares que puede reservar una sola inscripción (por ejemplo, para acompañantes)
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 10;

/**
 * @param {unknown} status
 * @returns {boolean}
 */
export function esEstadoTicketValido(status) {
  return typeof status === 'string' && TICKET_STATUSES.includes(status);
}

/**
 * @param {string} status
 * @returns {boolean} true si el ticket ocupa cupo
 */
export function esTicketActivo(status) {
  return ESTADOS_ACTIVOS.includes(status);
}
