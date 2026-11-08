import dotenv from 'dotenv';

// Carga las variables de entorno lo antes posible en el ciclo de vida de la app
dotenv.config({ quiet: true });

// Variables obligatorias para que la aplicación pueda iniciar.
// JWT_SECRET es obligatoria desde el login: sin ella no se pueden firmar ni verificar tokens.
const REQUERIDAS = ['PORT', 'NODE_ENV', 'MONGO_URL', 'JWT_SECRET'];

// Validación Fail-Fast: si falta alguna variable obligatoria, la app no arranca
const faltantes = REQUERIDAS.filter((clave) => !process.env[clave]);

if (faltantes.length > 0) {
  console.error(
    `Error de configuración: faltan variables de entorno obligatorias: ${faltantes.join(', ')}.`
  );
  console.error('Revisa tu archivo .env tomando como referencia .env.example.');
  process.exit(1);
}

const port = Number(process.env.PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Error de configuración: PORT debe ser un entero entre 1 y 65535 (valor recibido: "${process.env.PORT}").`);
  process.exit(1);
}

// Expiración del JWT: un número de segundos ("3600") o una duración con unidad
// ("15m", "1h", "7d"). Por defecto una hora, igual que la cookie de sesión.
// Un valor solo numérico se convierte a Number porque jsonwebtoken interpreta la
// cadena "3600" como milisegundos y el número 3600 como segundos.
const JWT_EXPIRES_IN_REGEX = /^(\d+)\s*(ms|s|m|h|d|w|y)?$/i;
const jwtExpiresInTexto = (process.env.JWT_EXPIRES_IN || '1h').trim();
const expiracion = JWT_EXPIRES_IN_REGEX.exec(jwtExpiresInTexto);

if (!expiracion || Number(expiracion[1]) === 0) {
  console.error(`Error de configuración: JWT_EXPIRES_IN debe ser un número de segundos o una duración mayor que cero (valor recibido: "${jwtExpiresInTexto}"). Ejemplos: 3600, 15m, 1h, 7d.`);
  process.exit(1);
}

const jwtExpiresIn = expiracion[2] ? jwtExpiresInTexto : Number(expiracion[1]);

// Un secreto corto se puede adivinar por fuerza bruta: se avisa sin detener el arranque
const JWT_SECRET_MIN_LENGTH = 32;
if (process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
  console.warn(`Aviso: JWT_SECRET tiene menos de ${JWT_SECRET_MIN_LENGTH} caracteres; usa un valor largo y aleatorio (ver .env.example).`);
}

// Correo (Nodemailer). MAIL_HOST es opcional: sin él, los correos no se envían sino que se
// registran en consola, para poder desarrollar sin credenciales. Con MAIL_HOST, el puerto debe
// ser válido y las credenciales salen siempre de aquí, nunca del código.
const mailHost = (process.env.MAIL_HOST || '').trim();
const mailPort = Number(process.env.MAIL_PORT || 587);
if (mailHost && (!Number.isInteger(mailPort) || mailPort < 1 || mailPort > 65535)) {
  console.error(`Error de configuración: MAIL_PORT debe ser un entero entre 1 y 65535 (valor recibido: "${process.env.MAIL_PORT}").`);
  process.exit(1);
}
if (!mailHost && process.env.NODE_ENV !== 'test') {
  console.warn('Aviso: MAIL_HOST no está definido; los correos de confirmación se registran en consola y no se envían.');
}

const config = {
  port,
  nodeEnv: process.env.NODE_ENV,
  isProduction: process.env.NODE_ENV === 'production',
  mongoUrl: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn,
  mail: {
    configured: mailHost !== '',
    host: mailHost,
    port: mailPort,
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || 'Café Aurora <no-reply@cafeaurora.local>',
  },
};

export default config;
