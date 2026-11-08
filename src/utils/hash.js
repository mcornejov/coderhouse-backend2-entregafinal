import bcrypt from 'bcrypt';

// Rondas de salt para bcrypt. Configurable por entorno dentro de un rango seguro:
// menos de 10 debilita el hash y más de 14 vuelve el registro demasiado lento.
const DEFAULT_SALT_ROUNDS = 10;
const rondasConfiguradas = Number(process.env.BCRYPT_SALT_ROUNDS);
const SALT_ROUNDS =
  Number.isInteger(rondasConfiguradas) && rondasConfiguradas >= 10 && rondasConfiguradas <= 14
    ? rondasConfiguradas
    : DEFAULT_SALT_ROUNDS;

// Genera el hash irreversible de una contraseña (incluye el salt en el resultado)
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Compara una contraseña en texto plano contra un hash almacenado (login)
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}
