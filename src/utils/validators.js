// Validadores reutilizables, sin dependencias de HTTP ni de la base de datos.

// Formato mínimo de email: algo@dominio.tld, sin espacios
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

// bcrypt solo considera los primeros 72 bytes de la contraseña; más allá de eso
// las contraseñas se compararían truncadas, así que se rechazan en la frontera.
export const PASSWORD_MAX_BYTES = 72;

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

export function isPasswordTooLong(value) {
  return Buffer.byteLength(value, 'utf8') > PASSWORD_MAX_BYTES;
}

// Normaliza el email para que "  Ana@Mail.com " y "ana@mail.com" sean el mismo usuario
export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

// Fecha en formato ISO 8601: "2027-03-15" o "2027-03-15T19:00:00[.000][Z|±hh:mm]".
// Date.parse por sí solo no alcanza: acepta "1" (lo lee como 2001), "March 7, 2027" y
// "2027-02-30" (que desplaza al 2 de marzo sin aviso). Se exige la forma ISO y que el día
// exista en ese mes, además de que el motor pueda interpretarla.
const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Normaliza una fecha ISO ya validada a su forma UTC ("2027-03-15T19:00:00.000Z").
 * Una hora sin zona ("2027-03-15T19:00:00") se interpreta como UTC, igual que la forma
 * solo-día: así el valor guardado no depende de la zona horaria del servidor.
 * @param {string} value texto que ya pasó isIsoDateString
 * @returns {string}
 */
export function toUtcIsoString(value) {
  const tieneHora = value.includes('T');
  const tieneZona = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const normalizado = tieneHora && !tieneZona ? `${value}Z` : value;
  return new Date(normalizado).toISOString();
}

export function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  const partes = ISO_DATE_REGEX.exec(value);
  if (!partes) return false;

  const [anio, mes, dia] = [partes[1], partes[2], partes[3]].map(Number);
  const [hora, minuto, segundo] = [partes[4] ?? '0', partes[5] ?? '0', partes[6] ?? '0'].map(Number);
  // Día 0 del mes siguiente = último día del mes pedido
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  return (
    mes >= 1 && mes <= 12 &&
    dia >= 1 && dia <= diasDelMes &&
    hora <= 23 && minuto <= 59 && segundo <= 59 &&
    !Number.isNaN(Date.parse(value))
  );
}

// "2027-03-15" sin componente de hora. Sirve para interpretar un límite superior de rango
// como el día completo y no como su medianoche.
export function isDateOnlyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
