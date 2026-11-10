import { randomInt } from 'node:crypto';

// Código de reserva legible: prefijo + 8 caracteres de un alfabeto sin símbolos ambiguos
// (sin 0/O ni 1/I/L) para que se pueda dictar o copiar de un correo sin confusiones.
// 31^8 ≈ 850 mil millones de combinaciones; el índice único del modelo cubre la colisión improbable.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO = 8;
export const PREFIJO_RESERVA = 'AUR';

/**
 * @returns {string} por ejemplo "AUR-7K3MQ9XZ"
 */
export function generarCodigoReserva() {
  let codigo = '';
  for (let i = 0; i < LARGO; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return `${PREFIJO_RESERVA}-${codigo}`;
}

export const RESERVATION_CODE_REGEX = new RegExp(`^${PREFIJO_RESERVA}-[${ALFABETO}]{${LARGO}}$`);
